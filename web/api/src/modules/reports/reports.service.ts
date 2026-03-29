import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import * as path from 'path';
import { HealthReport } from './entities/report.entity';
import { ReportAbnormality } from './entities/report-abnormality.entity';
import { CreateReportDto } from './dto/create-report.dto';
import {
  UpdateReportAbnormalityDto,
  UpdateReportDto,
} from './dto/update-report.dto';
import { HealthTask } from '../tasks/entities/task.entity';
import { Recheck } from '../rechecks/entities/recheck.entity';
import { FamilyService } from '../family/family.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../../common/storage/storage.service';

interface AiAbnormalityItem {
  itemName?: string;
  value?: string;
  unit?: string;
  referenceRange?: string;
  severity?: string;
  riskLevel?: string;
  category?: string;
  doctorAdvice?: string;
  followUpRequired?: boolean;
  followUpPeriod?: number;
}

interface AiParseResponse {
  reportDate?: string;
  hospital?: string;
  reportType?: string;
  aiSummary?: string;
  abnormalities?: AiAbnormalityItem[];
  processedAt?: string;
  lowConfidence?: boolean;
  rawItemsCount?: number;
  textPreview?: string;
  patientName?: string;
  patientAge?: number;
  patientSex?: string;
  healthTags?: string[];
  reportHighlights?: string[];
  parserMode?: string;
  sourceType?: string;
  reportKind?: string;
  reviewRequired?: boolean;
  pendingFields?: string[];
  fieldConfidences?: Record<string, number>;
  extractedSections?: Record<string, unknown>;
  confidenceScore?: number;
}

interface AiParseAttemptResult {
  data: AiParseResponse | null;
  error?: string;
  statusCode?: number;
}

interface NormalizedLogicalReport {
  patientName: string;
  hospital: string;
  reportType: string;
  reportDate: string;
}

interface ReportFilePayload {
  fileBuffer: Buffer;
  mimeType: string;
  originalName: string;
}

@Injectable()
export class ReportsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportsService.name);
  private readonly processingReportIds = new Set<string>();
  private processingTimer?: NodeJS.Timeout;
  private readonly processingStaleMs = 15 * 60 * 1000;
  // Temporary in-memory buffer for files awaiting AI analysis (Spaces mode)
  private readonly pendingBuffers = new Map<string, { buffer: Buffer; mimetype: string; filename: string }>();

  constructor(
    @InjectRepository(HealthReport)
    private readonly reportRepository: Repository<HealthReport>,
    @InjectRepository(ReportAbnormality)
    private readonly abnormalityRepository: Repository<ReportAbnormality>,
    @InjectRepository(HealthTask)
    private readonly tasksRepository: Repository<HealthTask>,
    @InjectRepository(Recheck)
    private readonly rechecksRepository: Repository<Recheck>,
    private readonly familyService: FamilyService,
    private readonly notificationsService: NotificationsService,
    private readonly storageService: StorageService,
  ) {}

  onModuleInit() {
    void this.schedulePendingReports();
    this.processingTimer = setInterval(() => {
      void this.schedulePendingReports();
    }, 15000);
  }

  onModuleDestroy() {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
    }
  }

  async uploadReport(
    userId: string,
    dto: CreateReportDto,
    file?: Express.Multer.File,
  ): Promise<HealthReport> {
    const fileHash = file ? this.computeFileHash(file.buffer) : undefined;
    if (fileHash) {
      const existingReport = await this.findExistingReportByFileHash(userId, fileHash);
      if (existingReport) {
        this.logger.log(
          `Skip duplicate report upload for user=${userId}, reportId=${existingReport.id}`,
        );
        return this.findOne(existingReport.id, userId);
      }
    }

    const fileUrl = file ? this.buildUploadFileUrl(file.originalname) : undefined;
    const fallbackReportDate = new Date().toISOString().slice(0, 10);

    const report = new HealthReport();
    report.userId = userId;
    report.reportType = dto.reportType?.trim() || '待解析报告';
    report.reportDate = new Date(dto.reportDate || fallbackReportDate);
    report.hospital = dto.hospital?.trim() || '待解析医院';
    report.fileUrl = fileUrl;
    report.status = file ? 'pending' : 'reviewed';
    if (file) {
      report.ocrData = {
        source: 'ai-service',
        fileHash,
        parseStatus: 'queued',
        queuedAt: new Date().toISOString(),
      };
    }

    const savedReport = await this.reportRepository.save(report);

    if (!file) {
      savedReport.aiSummary = '未上传报告文件，暂无法进行智能解析。';
      await this.reportRepository.save(savedReport);
      return this.findOne(savedReport.id, userId);
    }

    if (file && fileUrl) {
      if (this.storageService.isEnabled()) {
        // Upload to DO Spaces; keep buffer in memory for AI analysis
        const spacesUrl = await this.storageService.upload(
          file.buffer,
          file.originalname,
          file.mimetype,
        );
        savedReport.fileUrl = spacesUrl;
        await this.reportRepository.save(savedReport);
        this.pendingBuffers.set(savedReport.id, {
          buffer: file.buffer,
          mimetype: file.mimetype,
          filename: file.originalname,
        });
      } else {
        await this.persistUploadedFile(fileUrl, file.buffer);
      }
    }

    void this.processUploadedReport(savedReport.id).catch(
      (error: unknown) => {
        this.logger.error(
          `Background report analysis failed reportId=${savedReport.id}: ${
            error instanceof Error ? error.stack || error.message : String(error)
          }`,
        );
      },
    );

    return this.findOne(savedReport.id, userId);
  }

  private async processUploadedReport(reportId: string): Promise<void> {
    if (this.processingReportIds.has(reportId)) {
      return;
    }
    this.processingReportIds.add(reportId);

    const report = await this.reportRepository.findOne({
      where: { id: reportId },
    });

    if (!report) {
      this.processingReportIds.delete(reportId);
      return;
    }

    if (!report.fileUrl) {
      await this.handleAnalysisFailure(
        report,
        report.userId,
        Date.now(),
        '报告文件不存在，无法进入解析队列',
      );
      this.processingReportIds.delete(reportId);
      return;
    }

    const startedAt = Date.now();
    report.status = 'pending';
    report.ocrData = {
      ...(report.ocrData || {}),
      source: 'ai-service',
      fileHash: report.ocrData?.fileHash,
      parseStatus: 'processing',
      parseStartedAt: new Date(startedAt).toISOString(),
    };
    await this.reportRepository.save(report);

    try {
      const analysisResult = await this.analyzeReportWithAiService(report);

      if (!analysisResult.data) {
        await this.handleAnalysisFailure(
          report,
          report.userId,
          startedAt,
          analysisResult.error || '解析服务暂不可用或未返回结构化结果',
        );
        return;
      }

      await this.applyAnalysisResult(
        report,
        report.userId,
        analysisResult.data,
        report.ocrData?.fileHash,
        startedAt,
      );
    } finally {
      this.processingReportIds.delete(reportId);
    }
  }

  private async handleAnalysisFailure(
    report: HealthReport,
    userId: string,
    startedAt: number,
    reason: string,
  ): Promise<void> {
    report.status = 'pending';
    report.aiSummary = '报告已上传，解析失败，请稍后重试或重新上传更清晰的报告。';
    report.ocrData = {
      ...(report.ocrData || {}),
      source: 'ai-service',
      parseStatus: 'failed',
      parseCompletedAt: new Date().toISOString(),
      parseDurationMs: Date.now() - startedAt,
      parseError: reason,
    };
    await this.reportRepository.save(report);
    await this.notificationsService.sendReportProcessedNotification({
      userId,
      reportId: report.id,
      abnormalityCount: 0,
      success: false,
    });
  }

  private async applyAnalysisResult(
    savedReport: HealthReport,
    userId: string,
    analysisResult: AiParseResponse,
    fileHash: string | undefined,
    startedAt: number,
  ): Promise<void> {
    const mergeTarget = await this.findLogicalDuplicateReport(
      userId,
      savedReport.id,
      analysisResult,
    );
    const targetReport = mergeTarget ?? savedReport;

    const abnormalities = await this.persistAnalysisToReport(
      targetReport,
      userId,
      analysisResult,
      fileHash,
      startedAt,
      savedReport.fileUrl,
    );

    if (mergeTarget) {
      savedReport.status = 'reviewed';
      savedReport.aiSummary = `检测到同一份报告，已自动合并到 ${targetReport.reportDate.toISOString().slice(0, 10)} 的原报告记录。`;
      savedReport.ocrData = {
        ...(savedReport.ocrData || {}),
        source: 'ai-service',
        fileHash,
        parseStatus: 'completed',
        parseCompletedAt: new Date().toISOString(),
        parseDurationMs: Date.now() - startedAt,
        parserMode: analysisResult.parserMode || 'ocr',
        sourceType: analysisResult.sourceType,
        reportKind: analysisResult.reportKind,
        reviewRequired: !!analysisResult.reviewRequired,
        pendingFields: analysisResult.pendingFields || [],
        fieldConfidences: analysisResult.fieldConfidences || {},
        patientName: analysisResult.patientName,
        patientAge: analysisResult.patientAge,
        patientSex: analysisResult.patientSex,
        mergedIntoReportId: targetReport.id,
        mergedAt: new Date().toISOString(),
      };
      await this.reportRepository.save(savedReport);
      this.logger.log(
        `Merged duplicate report source=${savedReport.id} target=${targetReport.id}`,
      );
      return;
    }

    await this.familyService.createHealthEventRecords(
      userId,
      'report',
      targetReport.id,
      abnormalities.length > 0
        ? `已上传新报告，识别到 ${abnormalities.length} 项异常并生成后续任务。`
        : '已上传新报告，当前未识别到明确异常项。',
    );
    await this.notificationsService.sendReportProcessedNotification({
      userId,
      reportId: targetReport.id,
      abnormalityCount: abnormalities.length,
      success: true,
    });
  }

  async findAllByUser(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ data: HealthReport[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;

    const [data, total] = await this.reportRepository
      .createQueryBuilder('report')
      .where('report.userId = :userId', { userId })
      .andWhere(`coalesce(report.ocrData ->> 'mergedIntoReportId', '') = ''`)
      .orderBy('report.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  async findOne(id: string, userId: string): Promise<HealthReport> {
    const report = await this.findOwnedReport(id, userId, true);

    return report;
  }

  private async findOwnedReport(
    id: string,
    userId: string,
    resolveMerged: boolean = false,
  ): Promise<HealthReport> {
    const report = await this.reportRepository.findOne({
      where: { id, userId },
      relations: ['abnormalities'],
    });

    if (!report) {
      throw new NotFoundException('报告不存在或无权访问');
    }

    if (resolveMerged) {
      const mergedIntoReportId = report.ocrData?.mergedIntoReportId;
      if (mergedIntoReportId && mergedIntoReportId !== report.id) {
        const mergedReport = await this.reportRepository.findOne({
          where: { id: mergedIntoReportId, userId },
          relations: ['abnormalities'],
        });
        if (mergedReport) {
          return mergedReport;
        }
      }
    }

    return report;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateReportDto,
  ): Promise<HealthReport> {
    const report = await this.findOwnedReport(id, userId);

    if (dto.status !== undefined) {
      report.status = dto.status;
    }
    if (dto.aiSummary !== undefined) {
      report.aiSummary = dto.aiSummary;
    }

    if (dto.abnormalities !== undefined) {
      await this.replaceReportAbnormalities(userId, report, dto.abnormalities);
      report.status = 'reviewed';
      report.ocrData = {
        ...(report.ocrData || {}),
        parseStatus: 'completed',
        reviewedAt: new Date().toISOString(),
        reviewedManually: true,
        reviewRequired: false,
        pendingFields: [],
      };
      await this.familyService.createHealthEventRecords(
        userId,
        'report',
        report.id,
        `已人工校正报告解析结果，并重建复查与每日任务。`,
      );
    }

    await this.reportRepository.save(report);
    return this.findOne(id, userId);
  }

  async reparse(id: string, userId: string): Promise<HealthReport> {
    const report = await this.findOwnedReport(id, userId);

    if (!report.fileUrl) {
      throw new BadRequestException('该报告没有原始文件，无法重新解析');
    }

    try {
      await this.loadReportFilePayload(report);
    } catch {
      throw new BadRequestException('原始报告文件不存在，请重新上传');
    }

    if (this.processingReportIds.has(id) || report.ocrData?.parseStatus === 'processing') {
      return report;
    }

    report.status = 'pending';
    report.ocrData = {
      ...(report.ocrData || {}),
      source: 'ai-service',
      parseStatus: 'queued',
      queuedAt: new Date().toISOString(),
      parseStartedAt: null,
      parseCompletedAt: null,
      parseDurationMs: null,
      parseError: null,
    };
    await this.reportRepository.save(report);

    void this.processUploadedReport(report.id).catch((error: unknown) => {
      this.logger.error(
        `Background report re-analysis failed reportId=${report.id}: ${
          error instanceof Error ? error.stack || error.message : String(error)
        }`,
      );
    });

    return this.findOne(id, userId);
  }

  async remove(id: string, userId: string): Promise<void> {
    const report = await this.findOwnedReport(id, userId);
    await this.tasksRepository.delete({ userId, reportId: id });
    await this.rechecksRepository.delete({ userId, reportId: id });
    await this.reportRepository.remove(report);
  }

  private computeFileHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private async findExistingReportByFileHash(
    userId: string,
    fileHash: string,
  ): Promise<HealthReport | null> {
    const report = await this.reportRepository
      .createQueryBuilder('report')
      .where('report.userId = :userId', { userId })
      .andWhere(`report.ocrData ->> 'fileHash' = :fileHash`, { fileHash })
      .orderBy('report.createdAt', 'DESC')
      .getOne();

    if (!report) {
      return null;
    }

    const parseStatus = report.ocrData?.parseStatus;
    if (parseStatus === 'completed' || parseStatus === 'review_required') {
      return report;
    }

    if ((parseStatus === 'queued' || parseStatus === 'processing') && report.fileUrl) {
      try {
        await readFile(this.resolveAbsoluteUploadPath(report.fileUrl));
        return report;
      } catch {
        this.logger.warn(
          `Ignore duplicate match for missing upload file: reportId=${report.id}`,
        );
      }
    }

    return null;
  }

  private async persistAnalysisToReport(
    report: HealthReport,
    userId: string,
    analysisResult: AiParseResponse,
    fileHash: string | undefined,
    startedAt: number,
    preferredFileUrl?: string,
  ): Promise<ReportAbnormality[]> {
    await this.abnormalityRepository.delete({ reportId: report.id });
    await this.tasksRepository.delete({ userId, reportId: report.id });
    await this.rechecksRepository.delete({ userId, reportId: report.id });

    const abnormalityPayloads = (analysisResult.abnormalities || [])
      .filter((item) => (item.severity || '').toLowerCase() !== 'normal')
      .map((item) => this.normalizeAbnormality(item));

    const abnormalities = abnormalityPayloads.map((item) => {
      const abnormality = new ReportAbnormality();
      abnormality.reportId = report.id;
      Object.assign(abnormality, item);
      return abnormality;
    });

    if (abnormalities.length > 0) {
      await this.abnormalityRepository.save(abnormalities);
      await this.generateFollowUpRecords(userId, report.id, abnormalities);
    }

    if (analysisResult.reportDate) {
      report.reportDate = new Date(analysisResult.reportDate);
    }
    if (analysisResult.hospital) {
      report.hospital = analysisResult.hospital;
    }
    if (analysisResult.reportType) {
      report.reportType = analysisResult.reportType;
    }
    if (preferredFileUrl) {
      report.fileUrl = preferredFileUrl;
    }

    report.ocrData = {
      ...(report.ocrData || {}),
      source: 'ai-service',
      fileHash,
      processedAt: analysisResult.processedAt || new Date().toISOString(),
      parseStatus: analysisResult.reviewRequired ? 'review_required' : 'completed',
      parseCompletedAt: new Date().toISOString(),
      parseDurationMs: Date.now() - startedAt,
      reportDate: analysisResult.reportDate,
      hospital: analysisResult.hospital,
      reportType: analysisResult.reportType,
      abnormalitiesCount: abnormalities.length,
      lowConfidence: analysisResult.lowConfidence || false,
      rawItemsCount: analysisResult.rawItemsCount || abnormalities.length,
      textPreview: analysisResult.textPreview,
      patientName: analysisResult.patientName,
      patientAge: analysisResult.patientAge,
      patientSex: analysisResult.patientSex,
      healthTags: analysisResult.healthTags || [],
      reportHighlights: analysisResult.reportHighlights || [],
      parserMode: analysisResult.parserMode || 'ocr',
      sourceType: analysisResult.sourceType,
      reportKind: analysisResult.reportKind,
      reviewRequired: !!analysisResult.reviewRequired,
      pendingFields: analysisResult.pendingFields || [],
      fieldConfidences: analysisResult.fieldConfidences || {},
      extractedSections: analysisResult.extractedSections || {},
      confidenceScore: analysisResult.confidenceScore ?? null,
      mergedIntoReportId: null,
    };
    report.aiSummary =
      analysisResult.aiSummary ||
      (abnormalities.length > 0
        ? `共识别到${abnormalities.length}项异常指标，已生成对应复查与日常任务。`
        : '已完成报告解析，当前未识别到明确异常项。');
    if (analysisResult.reviewRequired) {
      report.aiSummary = `系统已提取部分结果，但仍有字段待确认。${report.aiSummary}`;
    }
    report.status = 'processed';
    await this.reportRepository.save(report);

    return abnormalities;
  }

  private async findLogicalDuplicateReport(
    userId: string,
    reportId: string,
    analysisResult: AiParseResponse,
  ): Promise<HealthReport | null> {
    const normalizedIncoming = this.normalizeLogicalReport(analysisResult);
    if (!normalizedIncoming.reportDate) {
      return null;
    }
    if (!normalizedIncoming.patientName && !normalizedIncoming.hospital) {
      return null;
    }

    const candidates = await this.reportRepository
      .createQueryBuilder('report')
      .where('report.userId = :userId', { userId })
      .andWhere('report.id != :reportId', { reportId })
      .andWhere(`coalesce(report.ocrData ->> 'mergedIntoReportId', '') = ''`)
      .orderBy('report.createdAt', 'ASC')
      .getMany();

    return (
      candidates.find((candidate) =>
        this.isSameLogicalReport(
          normalizedIncoming,
          this.normalizeLogicalReportFromEntity(candidate),
        ),
      ) || null
    );
  }

  private normalizeLogicalReport(data: Partial<AiParseResponse>): NormalizedLogicalReport {
    return {
      patientName: this.normalizeText(data.patientName),
      hospital: this.normalizeText(data.hospital),
      reportType: this.normalizeText(data.reportType),
      reportDate: this.normalizeDateText(data.reportDate),
    };
  }

  private normalizeLogicalReportFromEntity(report: HealthReport): NormalizedLogicalReport {
    return {
      patientName: this.normalizeText(report.ocrData?.patientName),
      hospital: this.normalizeText(report.hospital || report.ocrData?.hospital),
      reportType: this.normalizeText(report.reportType || report.ocrData?.reportType),
      reportDate: this.normalizeDateText(
        report.ocrData?.reportDate || report.reportDate?.toISOString?.() || report.reportDate,
      ),
    };
  }

  private isSameLogicalReport(
    left: NormalizedLogicalReport,
    right: NormalizedLogicalReport,
  ): boolean {
    if (!left.reportDate || left.reportDate !== right.reportDate) {
      return false;
    }
    if (left.patientName && right.patientName && left.patientName !== right.patientName) {
      return false;
    }
    if (left.hospital && right.hospital && left.hospital !== right.hospital) {
      return false;
    }
    if (left.reportType && right.reportType && left.reportType !== right.reportType) {
      return false;
    }
    return Boolean(
      (left.patientName && right.patientName) ||
        (left.hospital && right.hospital),
    );
  }

  private normalizeText(value?: string | null): string {
    return (value || '').replace(/\s+/g, '').trim().toLowerCase();
  }

  private normalizeDateText(value?: string | Date | null): string {
    if (!value) {
      return '';
    }
    const raw = String(value).trim();
    const direct = raw.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (direct) {
      const [, year, month, day] = direct;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toISOString().slice(0, 10);
  }

  private async analyzeReportWithAiService(
    report: HealthReport,
  ): Promise<AiParseAttemptResult> {
    const baseUrl = process.env.AI_SERVICE_URL?.trim();
    if (!baseUrl) {
      this.logger.warn('AI_SERVICE_URL is not set, skip analysis.');
      return {
        data: null,
        error: 'AI_SERVICE_URL 未配置，解析服务未启用',
      };
    }

    try {
      const endpoint = `${baseUrl.replace(/\/$/, '')}/api/parse-report-v2`;

      const { fileBuffer, mimeType, originalName } =
        await this.loadReportFilePayload(report);

      const formData = new FormData();
      const bytes = new Uint8Array(fileBuffer);
      const blob = new Blob([bytes], {
        type: mimeType,
      });
      formData.append('file', blob, originalName || `report-${Date.now()}`);

      const startedAt = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300000);
      this.logger.log(
        `Start report analysis: reportId=${report.id}, file=${originalName}, size=${fileBuffer.length}`,
      );
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const detail = await response.text();
        const compactDetail = detail.replace(/\s+/g, ' ').trim().slice(0, 300);
        throw new Error(`AI 解析接口异常(${response.status}): ${compactDetail}`);
      }

      const data = (await response.json()) as AiParseResponse;
      this.logger.log(
        `Report analysis completed in ${Date.now() - startedAt}ms, parserMode=${data.parserMode || 'unknown'}`,
      );
      return { data };
    } catch (error: any) {
      const isAbortError = error?.name === 'AbortError';
      const errorMessage = isAbortError
        ? 'AI 解析超时，请稍后重试'
        : `AI 解析失败：${error?.message || 'unknown error'}`;
      this.logger.error(
        `AI parse failed: ${errorMessage}`,
      );
      return {
        data: null,
        error: errorMessage,
      };
    }
  }

  private async schedulePendingReports(): Promise<void> {
    const pendingReports = await this.reportRepository.find({
      where: { status: 'pending' },
      order: { createdAt: 'ASC' },
      take: 10,
    });

    for (const report of pendingReports) {
      const parseStatus = report.ocrData?.parseStatus;
      const parseStartedAt = report.ocrData?.parseStartedAt
        ? new Date(report.ocrData.parseStartedAt).getTime()
        : null;
      const isStale =
        parseStartedAt !== null && Date.now() - parseStartedAt > this.processingStaleMs;

      if (!report.fileUrl) {
        continue;
      }

      try {
        await this.loadReportFilePayload(report);
      } catch {
        await this.handleAnalysisFailure(
          report,
          report.userId,
          Date.now(),
          `报告文件不存在: ${report.fileUrl}`,
        );
        continue;
      }

      if (
        !parseStatus ||
        parseStatus === 'queued' ||
        parseStatus === 'failed' ||
        (parseStatus === 'processing' && isStale)
      ) {
        if (parseStatus === 'processing' && isStale) {
          this.logger.warn(
            `Retry stale processing reportId=${report.id}, startedAt=${report.ocrData?.parseStartedAt}`,
          );
          this.processingReportIds.delete(report.id);
        }
        void this.processUploadedReport(report.id);
      }
    }
  }

  private buildUploadFileUrl(originalName?: string): string {
    const safeName = (originalName || 'report.bin')
      .replace(/[^\w.\-\u4e00-\u9fa5]/g, '_');
    return `/uploads/reports/${Date.now()}-${safeName}`;
  }

  private resolveAbsoluteUploadPath(fileUrl?: string): string {
    const relativePath = (fileUrl || '').replace(/^\/+/, '');
    return path.resolve(process.cwd(), relativePath);
  }

  private async loadReportFilePayload(report: HealthReport): Promise<ReportFilePayload> {
    const pending = this.pendingBuffers.get(report.id);
    if (pending) {
      this.pendingBuffers.delete(report.id);
      return {
        fileBuffer: pending.buffer,
        mimeType: pending.mimetype,
        originalName: pending.filename,
      };
    }

    const fileUrl = report.fileUrl;
    if (!fileUrl) {
      throw new Error('missing report file url');
    }

    if (this.storageService.isEnabled() && this.storageService.isExternalStorageUrl(fileUrl)) {
      const fileBuffer = await this.storageService.download(fileUrl);
      const normalizedUrl = fileUrl.split('?')[0];
      const originalName = normalizedUrl.split('/').pop() || `report-${report.id}`;
      return {
        fileBuffer,
        mimeType: this.inferMimeTypeFromPath(fileUrl),
        originalName,
      };
    }

    const absolutePath = this.resolveAbsoluteUploadPath(fileUrl);
    const fileBuffer = await readFile(absolutePath);
    return {
      fileBuffer,
      mimeType: this.inferMimeTypeFromPath(absolutePath),
      originalName: path.basename(absolutePath),
    };
  }

  private async persistUploadedFile(fileUrl: string, buffer: Buffer): Promise<void> {
    const absolutePath = this.resolveAbsoluteUploadPath(fileUrl);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buffer);
  }

  private inferMimeTypeFromPath(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf') {
      return 'application/pdf';
    }
    if (ext === '.png') {
      return 'image/png';
    }
    if (ext === '.jpg' || ext === '.jpeg') {
      return 'image/jpeg';
    }
    return 'application/octet-stream';
  }

  private normalizeAbnormality(item: AiAbnormalityItem): Partial<ReportAbnormality> {
    return {
      itemName: item.itemName || '异常指标',
      value: item.value || '-',
      unit: item.unit || '-',
      referenceRange: item.referenceRange || '-',
      severity: item.severity || 'mild',
      riskLevel: item.riskLevel || 'medium',
      category: item.category || '其他',
      doctorAdvice: item.doctorAdvice,
      followUpRequired: !!item.followUpRequired,
      followUpPeriod: this.resolveFollowUpDays(item.followUpPeriod),
    };
  }

  private normalizeManualAbnormality(
    item: UpdateReportAbnormalityDto,
  ): Partial<ReportAbnormality> {
    return this.normalizeAbnormality({
      itemName: item.itemName,
      value: item.value,
      unit: item.unit,
      referenceRange: item.referenceRange,
      severity: item.severity,
      riskLevel: item.riskLevel,
      category: item.category,
      doctorAdvice: item.doctorAdvice,
      followUpRequired: item.followUpRequired,
      followUpPeriod: item.followUpPeriod,
    });
  }

  private async replaceReportAbnormalities(
    userId: string,
    report: HealthReport,
    items: UpdateReportAbnormalityDto[],
  ): Promise<void> {
    await this.tasksRepository.delete({ reportId: report.id });
    await this.rechecksRepository.delete({ reportId: report.id });
    await this.abnormalityRepository.delete({ reportId: report.id });

    const normalizedItems = items
      .map((item) => this.normalizeManualAbnormality(item))
      .filter((item) => (item.severity || '').toLowerCase() !== 'normal');

    if (normalizedItems.length === 0) {
      return;
    }

    const abnormalities = normalizedItems.map((item) =>
      this.abnormalityRepository.create({
        reportId: report.id,
        ...item,
      }),
    );

    await this.abnormalityRepository.save(abnormalities);
    await this.generateFollowUpRecords(userId, report.id, abnormalities);
  }

  private async generateFollowUpRecords(
    userId: string,
    reportId: string,
    abnormalities: ReportAbnormality[],
  ): Promise<void> {
    const tasks: HealthTask[] = [];
    const rechecks: Recheck[] = [];
    const dailyTaskKeys = new Set<string>();

    for (const abnormality of abnormalities) {
      const category = abnormality.category || '';
      const itemName = abnormality.itemName || '异常指标';
      const riskLevel = abnormality.riskLevel || 'medium';
      const priority = riskLevel === 'urgent' || riskLevel === 'high' ? 'high' : 'medium';

      if (category === '血压' && !dailyTaskKeys.has('bp-daily')) {
        dailyTaskKeys.add('bp-daily');
        tasks.push(
          this.tasksRepository.create({
            userId,
            reportId,
            type: 'measurement',
            title: '监测血压',
            description: '建议早晚各测量一次血压并记录',
            recurrence: 'daily',
            priority: 'high',
            voiceEnabled: true,
          }),
          this.tasksRepository.create({
            userId,
            reportId,
            type: 'lifestyle',
            title: '低盐饮食与规律作息',
            description: '控制盐摄入量，规律睡眠，减少血压波动',
            recurrence: 'daily',
            priority: 'medium',
            voiceEnabled: true,
          }),
        );
      }

      if (category === '血糖' && !dailyTaskKeys.has('bg-daily')) {
        dailyTaskKeys.add('bg-daily');
        tasks.push(
          this.tasksRepository.create({
            userId,
            reportId,
            type: 'measurement',
            title: '监测血糖',
            description: '建议每日记录空腹或餐后血糖变化',
            recurrence: 'daily',
            priority: 'high',
            voiceEnabled: true,
          }),
          this.tasksRepository.create({
            userId,
            reportId,
            type: 'lifestyle',
            title: '控制碳水与糖分摄入',
            description: '减少高糖食物和含糖饮料，保持适量运动',
            recurrence: 'daily',
            priority: 'medium',
            voiceEnabled: true,
          }),
        );
      }

      if (abnormality.followUpRequired) {
        const followUpDays = this.resolveFollowUpDays(abnormality.followUpPeriod);
        const dueDate = new Date(Date.now() + followUpDays * 24 * 60 * 60 * 1000);
        const checkType = category || itemName;
        const doctorAdvice = abnormality.doctorAdvice || `建议${followUpDays}天后复查`;

        rechecks.push(
          this.rechecksRepository.create({
            userId,
            reportId,
            itemName,
            checkType,
            dueDate,
            status: 'pending',
            reminderEnabled: true,
            reminderDays: followUpDays <= 30 ? 3 : 7,
            notes: doctorAdvice,
          }),
        );

        tasks.push(
          this.tasksRepository.create({
            userId,
            reportId,
            type: 'recheck',
            title: `复查${itemName}`,
            description: doctorAdvice,
            recurrence: 'once',
            dueDate,
            priority,
            voiceEnabled: true,
          }),
        );
      }
    }

    if (tasks.length > 0) {
      await this.tasksRepository.save(tasks);
    }
    if (rechecks.length > 0) {
      await this.rechecksRepository.save(rechecks);
    }
  }

  private resolveFollowUpDays(followUpPeriod?: number): number {
    if (typeof followUpPeriod === 'number' && followUpPeriod > 0) {
      return followUpPeriod;
    }
    return 30;
  }
}
