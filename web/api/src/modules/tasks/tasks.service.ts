import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HealthTask } from './entities/task.entity';
import { HealthReport } from '../reports/entities/report.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(HealthTask)
    private tasksRepository: Repository<HealthTask>,
    @InjectRepository(HealthReport)
    private reportsRepository: Repository<HealthReport>,
  ) {}

  async create(userId: string, dto: CreateTaskDto): Promise<HealthTask> {
    const task = this.tasksRepository.create({
      ...dto,
      creatorRole: dto.creatorRole || 'self',
      userId,
    });
    return this.tasksRepository.save(task);
  }

  async findAll(
    userId: string,
    filters?: {
      type?: string;
      completed?: boolean;
      date?: string;
    },
  ): Promise<HealthTask[]> {
    const query = this.tasksRepository
      .createQueryBuilder('task')
      .where('task.userId = :userId', { userId });

    if (filters?.type) {
      query.andWhere('task.type = :type', { type: filters.type });
    }

    if (filters?.completed !== undefined) {
      query.andWhere('task.completed = :completed', {
        completed: filters.completed,
      });
    }

    if (filters?.date) {
      query.andWhere('task.dueDate = :date', { date: filters.date });
    }

    query.orderBy('task.priority', 'DESC').addOrderBy('task.createdAt', 'DESC');

    return query.getMany();
  }

  async findTodayTasks(userId: string): Promise<HealthTask[]> {
    const today = new Date().toISOString().split('T')[0];

    const tasks = await this.tasksRepository
      .createQueryBuilder('task')
      .where('task.userId = :userId', { userId })
      .andWhere(
        '(task.recurrence = :daily OR task.dueDate = :today OR (task.completed = false AND task.dueDate IS NULL))',
        { daily: 'daily', today },
      )
      .orderBy('task.priority', 'DESC')
      .addOrderBy('task.createdAt', 'DESC')
      .getMany();

    return tasks;
  }

  async findOne(id: string, userId: string): Promise<HealthTask> {
    const task = await this.tasksRepository.findOne({
      where: { id, userId },
    });

    if (!task) {
      throw new NotFoundException('任务不存在');
    }

    return task;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateTaskDto,
  ): Promise<HealthTask> {
    const task = await this.findOne(id, userId);
    Object.assign(task, dto);
    return this.tasksRepository.save(task);
  }

  async complete(id: string, userId: string): Promise<HealthTask> {
    const task = await this.findOne(id, userId);
    task.completed = true;
    task.completedAt = new Date();
    return this.tasksRepository.save(task);
  }

  async uncomplete(id: string, userId: string): Promise<HealthTask> {
    const task = await this.findOne(id, userId);
    task.completed = false;
    task.completedAt = null as any;
    return this.tasksRepository.save(task);
  }

  async remove(id: string, userId: string): Promise<void> {
    const task = await this.findOne(id, userId);
    await this.tasksRepository.remove(task);
  }

  async generateFromReport(
    userId: string,
    reportId: string,
  ): Promise<HealthTask[]> {
    const report = await this.reportsRepository.findOne({
      where: { id: reportId, userId },
      relations: ['abnormalities'],
    });

    if (!report) {
      throw new NotFoundException('报告不存在');
    }

    const tasks: HealthTask[] = [];
    const abnormalItems = report.abnormalities.filter(
      (abn) => abn.severity !== 'normal',
    );

    for (const abnormality of abnormalItems) {
      // Create measurement task for blood pressure or blood sugar
      if (abnormality.category === '血压' || abnormality.category === '血糖') {
        const measurementTask = this.tasksRepository.create({
          userId,
          reportId,
          type: 'measurement',
          title: `监测${abnormality.category}`,
          description: `${abnormality.itemName}: ${abnormality.value} ${abnormality.unit} (参考范围: ${abnormality.referenceRange})`,
          recurrence: 'daily',
          priority: abnormality.riskLevel === 'urgent' || abnormality.riskLevel === 'high' ? 'high' : 'medium',
          voiceEnabled: true,
          creatorRole: 'system',
        });
        tasks.push(measurementTask);
      }

      // Create recheck task if follow-up is required
      if (abnormality.followUpRequired) {
        const recheckTask = this.tasksRepository.create({
          userId,
          reportId,
          type: 'recheck',
          title: `复查${abnormality.itemName}`,
          description: abnormality.doctorAdvice || `建议${abnormality.followUpPeriod || 30}天后复查`,
          recurrence: 'once',
          dueDate: abnormality.followUpPeriod
            ? new Date(Date.now() + abnormality.followUpPeriod * 24 * 60 * 60 * 1000)
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          priority: abnormality.riskLevel === 'urgent' ? 'high' : 'medium',
          voiceEnabled: true,
          creatorRole: 'system',
        });
        tasks.push(recheckTask);
      }

      // Create lifestyle task for blood pressure
      if (abnormality.category === '血压') {
        const lifestyleTask = this.tasksRepository.create({
          userId,
          reportId,
          type: 'lifestyle',
          title: '低盐饮食',
          description: '控制每日盐摄入量在6克以下，避免高盐食物',
          recurrence: 'daily',
          priority: 'medium',
          voiceEnabled: true,
          creatorRole: 'system',
        });
        tasks.push(lifestyleTask);
      }

      // Create lifestyle task for blood sugar
      if (abnormality.category === '血糖') {
        const lifestyleTask = this.tasksRepository.create({
          userId,
          reportId,
          type: 'lifestyle',
          title: '低糖饮食',
          description: '控制糖分摄入，避免高糖食物和饮料',
          recurrence: 'daily',
          priority: 'medium',
          voiceEnabled: true,
          creatorRole: 'system',
        });
        tasks.push(lifestyleTask);
      }
    }

    return this.tasksRepository.save(tasks);
  }
}
