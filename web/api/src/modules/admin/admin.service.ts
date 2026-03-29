import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, MoreThan, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { HealthReport } from '../reports/entities/report.entity';
import { ReportAbnormality } from '../reports/entities/report-abnormality.entity';
import { HealthMetric } from '../metrics/entities/metric.entity';
import { HealthTask } from '../tasks/entities/task.entity';
import { getComplianceDefaults } from '../../common/compliance-defaults';

@Injectable()
export class AdminService {
  private readonly complianceDefaults = getComplianceDefaults();

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(HealthReport)
    private reportsRepository: Repository<HealthReport>,
    @InjectRepository(ReportAbnormality)
    private abnormalitiesRepository: Repository<ReportAbnormality>,
    @InjectRepository(HealthMetric)
    private metricsRepository: Repository<HealthMetric>,
    @InjectRepository(HealthTask)
    private tasksRepository: Repository<HealthTask>,
    private readonly dataSource: DataSource,
  ) {}

  async getDashboardStats() {
    const totalUsers = await this.usersRepository.count();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailyReports = await this.reportsRepository.count({
      where: { createdAt: MoreThan(today) },
    });

    const pendingAbnormalities = await this.abnormalitiesRepository.count({
      where: { riskLevel: 'high' },
    });

    const activeUsers = await this.usersRepository
      .createQueryBuilder('user')
      .leftJoin('user.metrics', 'metric')
      .where('metric.createdAt > :weekAgo', {
        weekAgo: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      })
      .groupBy('user.id')
      .getCount();

    return {
      totalUsers,
      dailyReports,
      pendingAbnormalities,
      activeUsers,
    };
  }

  async getRecentActivity(limit: number = 10) {
    const recentReports = await this.reportsRepository.find({
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: limit,
    });

    const recentMetrics = await this.metricsRepository.find({
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: limit,
    });

    const activities = [
      ...recentReports.map((report) => ({
        type: 'report',
        user: report.user.name,
        action: '上传了体检报告',
        timestamp: report.createdAt,
      })),
      ...recentMetrics.map((metric) => ({
        type: 'metric',
        user: metric.user.name,
        action: `记录了${metric.type === 'blood_pressure' ? '血压' : '血糖'}`,
        timestamp: metric.createdAt,
      })),
    ];

    activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return activities.slice(0, limit);
  }

  async getAbnormalAlerts() {
    const highRiskAbnormalities = await this.abnormalitiesRepository.find({
      where: { riskLevel: 'high' },
      relations: ['report', 'report.user'],
      order: { createdAt: 'DESC' },
      take: 20,
    });

    return highRiskAbnormalities.map((abnormality) => ({
      id: abnormality.id,
      userName: abnormality.report.user.name,
      itemName: abnormality.itemName,
      value: abnormality.value,
      unit: abnormality.unit,
      referenceRange: abnormality.referenceRange,
      severity: abnormality.severity,
      riskLevel: abnormality.riskLevel,
      category: abnormality.category,
      reportDate: abnormality.report.reportDate,
      createdAt: abnormality.createdAt,
    }));
  }

  async getAllUsers(page: number = 1, limit: number = 20, search?: string) {
    const query = this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.familyMembers', 'familyMembers')
      .leftJoinAndSelect('user.reports', 'reports')
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('user.createdAt', 'DESC');

    if (search) {
      query.where('user.name LIKE :search OR user.phone LIKE :search', {
        search: `%${search}%`,
      });
    }

    const [users, total] = await query.getManyAndCount();

    return {
      data: users.map((user) => ({
        id: user.id,
        name: user.name,
        phone: user.phone,
        age: user.age,
        healthTags: user.healthTags,
        familyCount: user.familyMembers?.length || 0,
        reportCount: user.reports?.length || 0,
        createdAt: user.createdAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAllReports(page: number = 1, limit: number = 20, status?: string) {
    const query = this.reportsRepository
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.user', 'user')
      .leftJoinAndSelect('report.abnormalities', 'abnormalities')
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('report.createdAt', 'DESC');

    if (status) {
      query.where('report.status = :status', { status });
    }

    const [reports, total] = await query.getManyAndCount();

    return {
      data: reports.map((report) => ({
        id: report.id,
        userName: report.user.name,
        reportType: report.reportType,
        reportDate: report.reportDate,
        hospital: report.hospital,
        status: report.status,
        abnormalityCount: report.abnormalities?.length || 0,
        createdAt: report.createdAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getMetricsStats(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const totalMetrics = await this.metricsRepository.count({
      where: { createdAt: MoreThan(startDate) },
    });

    const bloodPressureCount = await this.metricsRepository.count({
      where: {
        type: 'blood_pressure',
        createdAt: MoreThan(startDate),
      },
    });

    const bloodSugarCount = await this.metricsRepository.count({
      where: {
        type: 'blood_sugar',
        createdAt: MoreThan(startDate),
      },
    });

    const abnormalBP = await this.metricsRepository
      .createQueryBuilder('metric')
      .where('metric.type = :type', { type: 'blood_pressure' })
      .andWhere('metric.createdAt > :startDate', { startDate })
      .andWhere('(metric.systolic >= 140 OR metric.diastolic >= 90)')
      .getCount();

    const abnormalBS = await this.metricsRepository
      .createQueryBuilder('metric')
      .where('metric.type = :type', { type: 'blood_sugar' })
      .andWhere('metric.createdAt > :startDate', { startDate })
      .andWhere('metric.value >= 7.0')
      .getCount();

    return {
      totalMetrics,
      bloodPressureCount,
      bloodSugarCount,
      abnormalBP,
      abnormalBS,
      period: `${days}天`,
    };
  }

  async getComplianceDocs() {
    await this.ensureComplianceTable();
    const rows = await this.dataSource.query(
      'SELECT key, value, updated_at FROM app_settings WHERE key IN ($1, $2, $3, $4)',
      [
        'compliance_privacy',
        'compliance_terms',
        'compliance_medical',
        'compliance_data_deletion',
      ],
    );

    const rowMap = new Map<string, { value: string; updated_at: string }>();
    for (const row of rows) {
      rowMap.set(row.key, row);
    }

    return {
      privacy:
        rowMap.get('compliance_privacy')?.value || this.complianceDefaults.privacy,
      terms: rowMap.get('compliance_terms')?.value || this.complianceDefaults.terms,
      medical:
        rowMap.get('compliance_medical')?.value || this.complianceDefaults.medical,
      dataDeletion:
        rowMap.get('compliance_data_deletion')?.value
        || this.complianceDefaults.dataDeletion,
      updatedAt:
        rowMap.get('compliance_privacy')?.updated_at ||
        rowMap.get('compliance_terms')?.updated_at ||
        rowMap.get('compliance_medical')?.updated_at ||
        rowMap.get('compliance_data_deletion')?.updated_at ||
        new Date().toISOString(),
    };
  }

  async updateComplianceDocs(payload: {
    privacy?: string;
    terms?: string;
    medical?: string;
    dataDeletion?: string;
  }) {
    await this.ensureComplianceTable();
    const updates: Array<{ key: string; value: string | undefined }> = [
      { key: 'compliance_privacy', value: payload.privacy },
      { key: 'compliance_terms', value: payload.terms },
      { key: 'compliance_medical', value: payload.medical },
      { key: 'compliance_data_deletion', value: payload.dataDeletion },
    ];

    for (const item of updates) {
      if (typeof item.value !== 'string') {
        continue;
      }
      const value = item.value.trim();
      await this.dataSource.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key)
         DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [item.key, value],
      );
    }

    return this.getComplianceDocs();
  }

  private async ensureComplianceTable() {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key varchar(128) PRIMARY KEY,
        value text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT NOW()
      )
    `);
  }
}
