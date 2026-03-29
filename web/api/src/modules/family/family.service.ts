import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { FamilyMember } from './entities/family-member.entity';
import { SyncRecord } from './entities/sync-record.entity';
import { User } from '../users/entities/user.entity';
import { BindFamilyDto } from './dto/bind-family.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';
import { Recheck } from '../rechecks/entities/recheck.entity';
import { ScheduleRecheckDto } from '../rechecks/dto/schedule-recheck.dto';
import { AuthService } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { HealthTask } from '../tasks/entities/task.entity';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
import { UpdateTaskDto } from '../tasks/dto/update-task.dto';

@Injectable()
export class FamilyService {
  constructor(
    @InjectRepository(FamilyMember)
    private familyMemberRepository: Repository<FamilyMember>,
    @InjectRepository(SyncRecord)
    private syncRecordRepository: Repository<SyncRecord>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Recheck)
    private recheckRepository: Repository<Recheck>,
    @InjectRepository(HealthTask)
    private taskRepository: Repository<HealthTask>,
    private authService: AuthService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async bindFamilyMember(userId: string, dto: BindFamilyDto) {
    const familyAccount = (dto.familyAccount || dto.familyPhone || '')
      .trim()
      .toLowerCase();
    const isEmailAccount = familyAccount.includes('@');

    if (!familyAccount) {
      throw new BadRequestException('请填写家属邮箱或手机号');
    }

    if (isEmailAccount) {
      await this.authService.verifyEmailCode(familyAccount, dto.code);
    } else {
      await this.authService.verifyPhoneCode(familyAccount, dto.code);
    }

    const elder = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!elder) {
      throw new NotFoundException('未找到当前用户');
    }

    if (
      elder.phone === familyAccount ||
      (elder.email && elder.email.trim().toLowerCase() === familyAccount)
    ) {
      throw new BadRequestException('不能绑定自己为家属');
    }

    const familyUser = isEmailAccount
      ? await this.authService.findOrCreateUserByEmail(familyAccount)
      : await this.authService.findOrCreateUserByPhone(familyAccount);

    const existing = await this.familyMemberRepository.findOne({
      where: { userId: familyUser.id, elderUserId: elder.id },
    });

    if (existing) {
      throw new BadRequestException('该家属已绑定');
    }

    if (!familyUser.isFamilyMember) {
      familyUser.isFamilyMember = true;
      await this.userRepository.save(familyUser);
    }

    const familyMember = this.familyMemberRepository.create({
      userId: familyUser.id,
      elderUserId: elder.id,
      relationship: dto.relationship,
      canViewReports: true,
      canViewMetrics: true,
      notificationEnabled: true,
    });

    return this.familyMemberRepository.save(familyMember);
  }

  async findFamilyMembers(userId: string) {
    return this.familyMemberRepository.find({
      where: { elderUserId: userId },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async findElders(userId: string) {
    return this.familyMemberRepository.find({
      where: { userId },
      relations: ['elderUser'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, userId: string) {
    const familyMember = await this.familyMemberRepository.findOne({
      where: { id },
      relations: ['user', 'elderUser'],
    });

    if (!familyMember) {
      throw new NotFoundException('家属关系不存在');
    }

    if (
      familyMember.userId !== userId &&
      familyMember.elderUserId !== userId
    ) {
      throw new ForbiddenException('无权访问该家属关系');
    }

    return familyMember;
  }

  async updatePermissions(
    id: string,
    userId: string,
    dto: UpdatePermissionsDto,
  ) {
    const familyMember = await this.familyMemberRepository.findOne({
      where: { id },
    });

    if (!familyMember) {
      throw new NotFoundException('家属关系不存在');
    }

    if (familyMember.elderUserId !== userId) {
      throw new ForbiddenException('只有老人本人可以修改权限');
    }

    if (dto.canViewReports !== undefined) {
      familyMember.canViewReports = dto.canViewReports;
    }
    if (dto.canViewMetrics !== undefined) {
      familyMember.canViewMetrics = dto.canViewMetrics;
    }
    if (dto.notificationEnabled !== undefined) {
      familyMember.notificationEnabled = dto.notificationEnabled;
    }

    return this.familyMemberRepository.save(familyMember);
  }

  async unbind(id: string, userId: string) {
    const familyMember = await this.familyMemberRepository.findOne({
      where: { id },
    });

    if (!familyMember) {
      throw new NotFoundException('家属关系不存在');
    }

    if (
      familyMember.userId !== userId &&
      familyMember.elderUserId !== userId
    ) {
      throw new ForbiddenException('无权解除该家属关系');
    }

    await this.familyMemberRepository.remove(familyMember);
    return { message: '解除绑定成功' };
  }

  async getSyncRecords(userId: string) {
    const familyMembers = await this.familyMemberRepository.find({
      where: { userId },
    });

    const familyMemberIds = familyMembers.map((fm) => fm.id);

    const records = await this.syncRecordRepository.find({
      where: [
        { elderUserId: userId },
        ...(familyMemberIds.length > 0
          ? [{ familyMemberId: In(familyMemberIds) }]
          : []),
      ],
      relations: ['elderUser', 'familyMember', 'familyMember.user'],
      order: { syncedAt: 'DESC' },
    });

    return records;
  }

  async triggerSync(userId: string, elderId: string) {
    const familyMember = await this.ensureFamilyRelation(userId, elderId);

    const syncRecord = this.syncRecordRepository.create({
      elderUserId: elderId,
      familyMemberId: familyMember.id,
      syncType: 'manual',
      entityId: elderId,
      description: '手动同步',
    });

    return this.syncRecordRepository.save(syncRecord);
  }

  async ensureFamilyAccess(userId: string, elderId: string) {
    return this.ensureFamilyRelation(userId, elderId);
  }

  async getElderRechecks(userId: string, elderId: string) {
    await this.ensureFamilyRelation(userId, elderId);

    return this.recheckRepository.find({
      where: {
        userId: elderId,
        status: In(['pending', 'scheduled']),
      },
      order: { dueDate: 'ASC' },
    });
  }

  async getElderTasks(userId: string, elderId: string) {
    await this.ensureFamilyRelation(userId, elderId);

    return this.taskRepository.find({
      where: { userId: elderId },
      order: {
        completed: 'ASC',
        priority: 'DESC',
        createdAt: 'DESC',
      },
    });
  }

  async createElderTask(userId: string, elderId: string, dto: CreateTaskDto) {
    const familyMember = await this.ensureFamilyRelationWithUser(userId, elderId);

    const task = this.taskRepository.create({
      ...dto,
      userId: elderId,
      creatorRole: 'family',
    });
    const savedTask = await this.taskRepository.save(task);

    await this.recordFamilyTaskChange({
      elderUserId: elderId,
      familyMemberId: familyMember.id,
      syncType: 'task',
      entityId: savedTask.id,
      description: `${familyMember.user?.name || '家属'} 为你新建了任务「${savedTask.title}」`,
    });

    return savedTask;
  }

  async updateElderTask(
    userId: string,
    elderId: string,
    taskId: string,
    dto: UpdateTaskDto,
  ) {
    const familyMember = await this.ensureFamilyRelationWithUser(userId, elderId);
    const task = await this.findElderTask(taskId, elderId);

    Object.assign(task, dto, {
      creatorRole: task.creatorRole === 'system' ? task.creatorRole : 'family',
    });

    const savedTask = await this.taskRepository.save(task);

    await this.recordFamilyTaskChange({
      elderUserId: elderId,
      familyMemberId: familyMember.id,
      syncType: 'task_update',
      entityId: savedTask.id,
      description: `${familyMember.user?.name || '家属'} 更新了任务「${savedTask.title}」`,
    });

    return savedTask;
  }

  async deleteElderTask(userId: string, elderId: string, taskId: string) {
    const familyMember = await this.ensureFamilyRelationWithUser(userId, elderId);
    const task = await this.findElderTask(taskId, elderId);
    const taskTitle = task.title;

    await this.taskRepository.remove(task);

    await this.recordFamilyTaskChange({
      elderUserId: elderId,
      familyMemberId: familyMember.id,
      syncType: 'task_delete',
      entityId: taskId,
      description: `${familyMember.user?.name || '家属'} 删除了任务「${taskTitle}」`,
    });
  }

  async scheduleElderRecheck(
    userId: string,
    elderId: string,
    recheckId: string,
    dto: ScheduleRecheckDto,
  ) {
    const familyMember = await this.ensureFamilyRelation(userId, elderId);
    const recheck = await this.recheckRepository.findOne({
      where: { id: recheckId, userId: elderId },
    });

    if (!recheck) {
      throw new NotFoundException('复查记录不存在');
    }

    recheck.appointmentDate = new Date(dto.appointmentDate);
    recheck.hospital = dto.hospital;
    recheck.status = 'scheduled';
    const savedRecheck = await this.recheckRepository.save(recheck);

    const syncRecord = this.syncRecordRepository.create({
      elderUserId: elderId,
      familyMemberId: familyMember.id,
      syncType: 'recheck',
      entityId: savedRecheck.id,
      description: `家属已代为预约${savedRecheck.checkType}复查，预约日期 ${dto.appointmentDate}。`,
    });
    await this.syncRecordRepository.save(syncRecord);
    await this.notificationsService.sendFamilyFollowUpToElder({
      elderUserId: elderId,
      syncType: 'recheck',
      entityId: savedRecheck.id,
      description: syncRecord.description || '家属已代为安排复查。',
    });

    return savedRecheck;
  }

  async claimElderRecheckAction(
    userId: string,
    elderId: string,
    recheckId: string,
    actionType: 'booking' | 'visit' | 'reminder',
  ) {
    const familyMember = await this.familyMemberRepository.findOne({
      where: { userId, elderUserId: elderId },
      relations: ['user'],
    });

    if (!familyMember) {
      throw new ForbiddenException('您不是该老人的家属');
    }

    const recheck = await this.recheckRepository.findOne({
      where: { id: recheckId, userId: elderId },
    });

    if (!recheck) {
      throw new NotFoundException('复查记录不存在');
    }

    const actionLabel =
      actionType === 'booking'
        ? '预约'
        : actionType === 'visit'
        ? '陪诊'
        : '提醒';

    const syncRecord = this.syncRecordRepository.create({
      elderUserId: elderId,
      familyMemberId: familyMember.id,
      syncType: `claim_${actionType}`,
      entityId: recheck.id,
      description: `${familyMember.user?.name || '家属'} 已认领${recheck.checkType}的${actionLabel}跟进。`,
    });

    const savedRecord = await this.syncRecordRepository.save(syncRecord);
    await this.notificationsService.sendFamilyFollowUpToElder({
      elderUserId: elderId,
      syncType: savedRecord.syncType,
      entityId: recheck.id,
      description: savedRecord.description || '家属已跟进复查事项。',
    });
    return savedRecord;
  }

  async createHealthEventRecords(
    elderUserId: string,
    syncType: string,
    entityId: string,
    description: string,
  ): Promise<number> {
    const familyMembers = await this.familyMemberRepository.find({
      where: {
        elderUserId,
        notificationEnabled: true,
      },
    });

    if (familyMembers.length === 0) {
      return 0;
    }

    const records = familyMembers
      .filter((familyMember) => {
        if (syncType === 'metric') {
          return familyMember.canViewMetrics;
        }
        return familyMember.canViewReports;
      })
      .map((familyMember) =>
        this.syncRecordRepository.create({
          elderUserId,
          familyMemberId: familyMember.id,
          syncType,
          entityId,
          description,
        }),
      );

    if (records.length === 0) {
      return 0;
    }

    await this.syncRecordRepository.save(records);
    await this.notificationsService.sendFamilyFollowUpToMembers({
      elderUserId,
      syncType,
      entityId,
      description,
    });
    return records.length;
  }

  private async findElderTask(taskId: string, elderId: string) {
    const task = await this.taskRepository.findOne({
      where: { id: taskId, userId: elderId },
    });

    if (!task) {
      throw new NotFoundException('任务不存在');
    }

    return task;
  }

  private async recordFamilyTaskChange(params: {
    elderUserId: string;
    familyMemberId: string;
    syncType: string;
    entityId: string;
    description: string;
  }) {
    const syncRecord = this.syncRecordRepository.create(params);
    await this.syncRecordRepository.save(syncRecord);
    await this.notificationsService.sendFamilyFollowUpToElder({
      elderUserId: params.elderUserId,
      syncType: params.syncType,
      entityId: params.entityId,
      description: params.description,
    });
  }

  private async ensureFamilyRelationWithUser(userId: string, elderId: string) {
    const familyMember = await this.familyMemberRepository.findOne({
      where: { userId, elderUserId: elderId },
      relations: ['user'],
    });

    if (!familyMember) {
      throw new ForbiddenException('您不是该老人的家属');
    }

    return familyMember;
  }

  private async ensureFamilyRelation(userId: string, elderId: string) {
    const familyMember = await this.familyMemberRepository.findOne({
      where: { userId, elderUserId: elderId },
    });

    if (!familyMember) {
      throw new ForbiddenException('您不是该老人的家属');
    }

    return familyMember;
  }
}
