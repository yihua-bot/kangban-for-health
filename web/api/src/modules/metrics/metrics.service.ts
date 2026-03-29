import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HealthMetric } from './entities/metric.entity';
import { CreateBloodPressureDto } from './dto/create-blood-pressure.dto';
import { CreateBloodSugarDto } from './dto/create-blood-sugar.dto';
import { HealthTask } from '../tasks/entities/task.entity';
import { FamilyService } from '../family/family.service';
import { Recheck } from '../rechecks/entities/recheck.entity';

export interface MetricRecordResult {
  metric: HealthMetric;
  completedTaskCount: number;
  alertTriggered: boolean;
  familySyncCount: number;
  escalation: null | {
    triggered: boolean;
    level: 'review' | 'clinic' | 'urgent';
    streakCount: number;
    abnormalDayCount: number;
    taskId?: string;
    recheckId?: string;
    summary: string;
  };
}

@Injectable()
export class MetricsService {
  constructor(
    @InjectRepository(HealthMetric)
    private readonly metricRepo: Repository<HealthMetric>,
    @InjectRepository(HealthTask)
    private readonly taskRepo: Repository<HealthTask>,
    @InjectRepository(Recheck)
    private readonly recheckRepo: Repository<Recheck>,
    private readonly familyService: FamilyService,
  ) {}

  async recordBloodPressure(
    userId: string,
    dto: CreateBloodPressureDto,
  ): Promise<MetricRecordResult> {
    const metric = this.metricRepo.create({
      userId,
      type: 'blood_pressure',
      systolic: dto.systolic,
      diastolic: dto.diastolic,
      unit: 'mmHg',
      measuredAt: dto.measuredAt ? new Date(dto.measuredAt) : new Date(),
      notes: dto.notes,
    });
    const savedMetric = await this.metricRepo.save(metric);
    const completedTaskCount = await this.completeMeasurementTasks(userId, 'blood_pressure');
    const alertTriggered = dto.systolic >= 140 || dto.diastolic >= 90;
    const escalation = alertTriggered
      ? await this.maybeEscalateMetricAbnormality(userId, 'blood_pressure')
      : null;
    const familySyncCount = alertTriggered
      ? await this.familyService.createHealthEventRecords(
          userId,
          'metric',
          savedMetric.id,
          escalation?.triggered
            ? `新增血压记录 ${dto.systolic}/${dto.diastolic} mmHg，${escalation.summary}，系统已升级为高优先级跟进。`
            : `新增血压记录 ${dto.systolic}/${dto.diastolic} mmHg，建议家属关注近期波动。`,
        )
      : 0;

    return {
      metric: savedMetric,
      completedTaskCount,
      alertTriggered,
      familySyncCount,
      escalation,
    };
  }

  async recordBloodSugar(
    userId: string,
    dto: CreateBloodSugarDto,
  ): Promise<MetricRecordResult> {
    const metric = this.metricRepo.create({
      userId,
      type: 'blood_sugar',
      value: dto.value,
      unit: 'mmol/L',
      timing: dto.timing,
      measuredAt: dto.measuredAt ? new Date(dto.measuredAt) : new Date(),
      notes: dto.notes,
    });
    const savedMetric = await this.metricRepo.save(metric);
    const completedTaskCount = await this.completeMeasurementTasks(userId, 'blood_sugar');
    const alertTriggered = dto.value >= 7.0;
    const escalation = alertTriggered
      ? await this.maybeEscalateMetricAbnormality(userId, 'blood_sugar')
      : null;
    const timingLabel = dto.timing ? `${dto.timing}血糖` : '血糖';
    const familySyncCount = alertTriggered
      ? await this.familyService.createHealthEventRecords(
          userId,
          'metric',
          savedMetric.id,
          escalation?.triggered
            ? `新增${timingLabel}记录 ${dto.value} mmol/L，${escalation.summary}，系统已升级为高优先级跟进。`
            : `新增${timingLabel}记录 ${dto.value} mmol/L，建议家属协助关注饮食和复测。`,
        )
      : 0;

    return {
      metric: savedMetric,
      completedTaskCount,
      alertTriggered,
      familySyncCount,
      escalation,
    };
  }

  async findAll(
    userId: string,
    type?: string,
    days: number = 7,
  ): Promise<HealthMetric[]> {
    const qb = this.metricRepo
      .createQueryBuilder('m')
      .where('m.userId = :userId', { userId });

    if (type) {
      qb.andWhere('m.type = :type', { type });
    }

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    qb.andWhere('m.measuredAt >= :sinceDate', { sinceDate });

    qb.orderBy('m.measuredAt', 'DESC');

    return qb.getMany();
  }

  async getStats(
    userId: string,
    type: string,
    days: number = 7,
  ): Promise<{
    average: number;
    min: number;
    max: number;
    count: number;
    abnormalCount: number;
    latestValue: any;
    trend: string;
  }> {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    // Build base query for aggregate stats
    const qb = this.metricRepo
      .createQueryBuilder('m')
      .where('m.userId = :userId', { userId })
      .andWhere('m.type = :type', { type })
      .andWhere('m.measuredAt >= :sinceDate', { sinceDate });

    let statsQuery: string;
    let abnormalQuery: string;

    if (type === 'blood_pressure') {
      statsQuery = `
        SELECT
          ROUND(AVG(m.systolic)::numeric, 1) as average,
          MIN(m.systolic) as min,
          MAX(m.systolic) as max,
          COUNT(*)::int as count
        FROM health_metrics m
        WHERE m.user_id = $1 AND m.type = $2 AND m.measured_at >= $3
      `;
      abnormalQuery = `
        SELECT COUNT(*)::int as abnormal_count
        FROM health_metrics m
        WHERE m.user_id = $1 AND m.type = $2 AND m.measured_at >= $3
          AND (m.systolic >= 140 OR m.diastolic >= 90)
      `;
    } else {
      statsQuery = `
        SELECT
          ROUND(AVG(m.value)::numeric, 1) as average,
          MIN(m.value) as min,
          MAX(m.value) as max,
          COUNT(*)::int as count
        FROM health_metrics m
        WHERE m.user_id = $1 AND m.type = $2 AND m.measured_at >= $3
      `;
      abnormalQuery = `
        SELECT COUNT(*)::int as abnormal_count
        FROM health_metrics m
        WHERE m.user_id = $1 AND m.type = $2 AND m.measured_at >= $3
          AND m.value >= 7.0
      `;
    }

    const params = [userId, type, sinceDate];

    const [statsResult] = await this.metricRepo.query(statsQuery, params);
    const [abnormalResult] = await this.metricRepo.query(abnormalQuery, params);

    // Get latest record
    const latestRecord = await this.metricRepo.findOne({
      where: { userId, type },
      order: { measuredAt: 'DESC' },
    });

    let latestValue: any = null;
    if (latestRecord) {
      if (type === 'blood_pressure') {
        latestValue = {
          systolic: latestRecord.systolic,
          diastolic: latestRecord.diastolic,
          measuredAt: latestRecord.measuredAt,
        };
      } else {
        latestValue = {
          value: latestRecord.value,
          measuredAt: latestRecord.measuredAt,
        };
      }
    }

    // Calculate trend: compare last 3 days avg vs previous 3 days avg
    const trend = await this.calculateTrend(userId, type);

    return {
      average: parseFloat(statsResult?.average) || 0,
      min: parseFloat(statsResult?.min) || 0,
      max: parseFloat(statsResult?.max) || 0,
      count: parseInt(statsResult?.count) || 0,
      abnormalCount: parseInt(abnormalResult?.abnormal_count) || 0,
      latestValue,
      trend,
    };
  }

  private async calculateTrend(userId: string, type: string): Promise<string> {
    const valueColumn = type === 'blood_pressure' ? 'systolic' : 'value';

    const now = new Date();
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(now.getDate() - 3);
    const sixDaysAgo = new Date();
    sixDaysAgo.setDate(now.getDate() - 6);

    // Recent 3 days average
    const [recentResult] = await this.metricRepo.query(
      `SELECT AVG(m.${valueColumn})::numeric as avg_val
       FROM health_metrics m
       WHERE m.user_id = $1 AND m.type = $2
         AND m.measured_at >= $3 AND m.measured_at < $4`,
      [userId, type, threeDaysAgo, now],
    );

    // Previous 3 days average (day 4-6)
    const [previousResult] = await this.metricRepo.query(
      `SELECT AVG(m.${valueColumn})::numeric as avg_val
       FROM health_metrics m
       WHERE m.user_id = $1 AND m.type = $2
         AND m.measured_at >= $3 AND m.measured_at < $4`,
      [userId, type, sixDaysAgo, threeDaysAgo],
    );

    const recentAvg = parseFloat(recentResult?.avg_val);
    const previousAvg = parseFloat(previousResult?.avg_val);

    if (isNaN(recentAvg) || isNaN(previousAvg)) {
      return 'stable';
    }

    const diff = recentAvg - previousAvg;
    const threshold = previousAvg * 0.05; // 5% threshold

    if (diff > threshold) {
      return 'up';
    } else if (diff < -threshold) {
      return 'down';
    }
    return 'stable';
  }

  async remove(id: string, userId: string): Promise<void> {
    const metric = await this.metricRepo.findOne({ where: { id } });

    if (!metric) {
      throw new NotFoundException('记录不存在');
    }

    if (metric.userId !== userId) {
      throw new ForbiddenException('无权删除此记录');
    }

    await this.metricRepo.remove(metric);
  }

  private async completeMeasurementTasks(
    userId: string,
    metricType: 'blood_pressure' | 'blood_sugar',
  ): Promise<number> {
    const keyword = metricType === 'blood_pressure' ? '血压' : '血糖';
    const tasks = await this.taskRepo
      .createQueryBuilder('task')
      .where('task.userId = :userId', { userId })
      .andWhere('task.type = :type', { type: 'measurement' })
      .andWhere('task.completed = false')
      .andWhere(
        '(task.title LIKE :keyword OR task.description LIKE :keyword)',
        { keyword: `%${keyword}%` },
      )
      .getMany();

    if (tasks.length === 0) {
      return 0;
    }

    const completedAt = new Date();
    tasks.forEach((task) => {
      task.completed = true;
      task.completedAt = completedAt;
    });
    await this.taskRepo.save(tasks);
    return tasks.length;
  }

  private async maybeEscalateMetricAbnormality(
    userId: string,
    metricType: 'blood_pressure' | 'blood_sugar',
  ): Promise<MetricRecordResult['escalation']> {
    const recentMetrics = await this.metricRepo.find({
      where: { userId, type: metricType },
      order: { measuredAt: 'DESC' },
      take: 10,
    });

    const streakCount = this.getAbnormalStreakCount(recentMetrics, metricType);
    const abnormalDayCount = this.getAbnormalDayCount(recentMetrics, metricType, 7);
    const shouldEscalate = streakCount >= 3 || abnormalDayCount >= 3;
    const level = this.resolveEscalationLevel(recentMetrics[0], metricType, streakCount, abnormalDayCount);

    if (!shouldEscalate) {
      return {
        triggered: false,
        level,
        streakCount,
        abnormalDayCount,
        summary: streakCount > 0 ? `当前已连续 ${streakCount} 次异常` : `近 7 天异常 ${abnormalDayCount} 天`,
      };
    }

    const summary =
      streakCount >= 3
        ? `最近已连续 ${streakCount} 次异常`
        : `近 7 天已有 ${abnormalDayCount} 天异常`;

    const task = await this.upsertEscalationTask(userId, metricType, summary, level);
    const recheck = await this.upsertEscalationRecheck(userId, metricType, summary, level);

    return {
      triggered: true,
      level,
      streakCount,
      abnormalDayCount,
      taskId: task.id,
      recheckId: recheck.id,
      summary,
    };
  }

  private getAbnormalStreakCount(
    metrics: HealthMetric[],
    metricType: 'blood_pressure' | 'blood_sugar',
  ): number {
    let count = 0;
    for (const metric of metrics) {
      if (!this.isMetricAbnormal(metric, metricType)) {
        break;
      }
      count += 1;
    }
    return count;
  }

  private getAbnormalDayCount(
    metrics: HealthMetric[],
    metricType: 'blood_pressure' | 'blood_sugar',
    daysWindow: number,
  ): number {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - (daysWindow - 1));
    const abnormalDays = new Set<string>();

    metrics.forEach((metric) => {
      if (metric.measuredAt < thresholdDate) {
        return;
      }
      if (this.isMetricAbnormal(metric, metricType)) {
        abnormalDays.add(metric.measuredAt.toISOString().slice(0, 10));
      }
    });

    return abnormalDays.size;
  }

  private isMetricAbnormal(
    metric: HealthMetric,
    metricType: 'blood_pressure' | 'blood_sugar',
  ): boolean {
    if (metricType === 'blood_pressure') {
      return Number(metric.systolic || 0) >= 140 || Number(metric.diastolic || 0) >= 90;
    }
    return Number(metric.value || 0) >= 7;
  }

  private resolveEscalationLevel(
    latestMetric: HealthMetric | undefined,
    metricType: 'blood_pressure' | 'blood_sugar',
    streakCount: number,
    abnormalDayCount: number,
  ): 'review' | 'clinic' | 'urgent' {
    if (!latestMetric) {
      return 'review';
    }

    if (metricType === 'blood_pressure') {
      const systolic = Number(latestMetric.systolic || 0);
      const diastolic = Number(latestMetric.diastolic || 0);
      if (systolic >= 180 || diastolic >= 110 || streakCount >= 5 || abnormalDayCount >= 5) {
        return 'urgent';
      }
      if (systolic >= 160 || diastolic >= 100 || streakCount >= 4 || abnormalDayCount >= 4) {
        return 'clinic';
      }
      return 'review';
    }

    const sugar = Number(latestMetric.value || 0);
    if (sugar >= 11.1 || streakCount >= 5 || abnormalDayCount >= 5) {
      return 'urgent';
    }
    if (sugar >= 9 || streakCount >= 4 || abnormalDayCount >= 4) {
      return 'clinic';
    }
    return 'review';
  }

  private async upsertEscalationTask(
    userId: string,
    metricType: 'blood_pressure' | 'blood_sugar',
    summary: string,
    level: 'review' | 'clinic' | 'urgent',
  ): Promise<HealthTask> {
    const keyword = metricType === 'blood_pressure' ? '血压' : '血糖';
    const title = `${this.getEscalationLevelLabel(level)}·连续${keyword}异常跟进`;
    const today = new Date();
    const dueDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const existingTask = await this.taskRepo.findOne({
      where: {
        userId,
        title,
        completed: false,
      },
      order: { createdAt: 'DESC' },
    });

    const task = existingTask || this.taskRepo.create({ userId, title });
    task.type = 'recheck';
    task.description = `${summary}，${this.getEscalationActionText(level, metricType)}`;
    task.recurrence = 'once';
    task.priority = level === 'review' ? 'medium' : 'high';
    task.dueDate = dueDate;
    task.scheduledTime =
      level === 'urgent'
        ? '08:00:00'
        : metricType === 'blood_pressure'
        ? '09:00:00'
        : '10:00:00';
    task.voiceEnabled = true;

    return this.taskRepo.save(task);
  }

  private async upsertEscalationRecheck(
    userId: string,
    metricType: 'blood_pressure' | 'blood_sugar',
    summary: string,
    level: 'review' | 'clinic' | 'urgent',
  ): Promise<Recheck> {
    const keyword = metricType === 'blood_pressure' ? '血压' : '血糖';
    const checkType = level === 'urgent'
      ? metricType === 'blood_pressure'
        ? '加急血压复查'
        : '加急血糖复查'
      : metricType === 'blood_pressure'
      ? '血压复测'
      : '血糖复测';
    const itemName = `${this.getEscalationLevelLabel(level)}·连续${keyword}异常`;
    const targetDueDate = new Date();
    targetDueDate.setDate(targetDueDate.getDate() + (level === 'urgent' ? 1 : level === 'clinic' ? 3 : 5));

    const existingRecheck = await this.recheckRepo.findOne({
      where: {
        userId,
        itemName,
        status: 'pending',
      },
      order: { createdAt: 'DESC' },
    });

    const recheck = existingRecheck || this.recheckRepo.create({ userId, itemName });
    recheck.checkType = checkType;
    recheck.status = existingRecheck?.status || 'pending';
    recheck.reminderEnabled = true;
    recheck.reminderDays = level === 'review' ? 2 : 1;
    recheck.notes = `${summary}，${this.getEscalationActionText(level, metricType)}`;
    recheck.dueDate =
      existingRecheck?.dueDate && existingRecheck.dueDate < targetDueDate
        ? existingRecheck.dueDate
        : targetDueDate;

    return this.recheckRepo.save(recheck);
  }

  private getEscalationLevelLabel(level: 'review' | 'clinic' | 'urgent') {
    if (level === 'urgent') {
      return '加急处理';
    }
    if (level === 'clinic') {
      return '门诊优先';
    }
    return '复测观察';
  }

  private getEscalationActionText(
    level: 'review' | 'clinic' | 'urgent',
    metricType: 'blood_pressure' | 'blood_sugar',
  ) {
    const keyword = metricType === 'blood_pressure' ? '血压' : '血糖';
    if (level === 'urgent') {
      return `建议今天内再次复测${keyword}，并尽快安排线下门诊或复查。`;
    }
    if (level === 'clinic') {
      return `建议 3 天内完成复测，并优先安排门诊评估。`;
    }
    return `建议近 5 天持续复测${keyword}，如仍异常再安排门诊复查。`;
  }
}
