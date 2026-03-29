import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, In } from 'typeorm';
import { Recheck } from './entities/recheck.entity';
import { CreateRecheckDto } from './dto/create-recheck.dto';
import { UpdateRecheckDto } from './dto/update-recheck.dto';
import { ScheduleRecheckDto } from './dto/schedule-recheck.dto';
import { FamilyService } from '../family/family.service';

@Injectable()
export class RechecksService {
  constructor(
    @InjectRepository(Recheck)
    private recheckRepository: Repository<Recheck>,
    private readonly familyService: FamilyService,
  ) {}

  async create(userId: string, dto: CreateRecheckDto): Promise<Recheck> {
    const recheck = this.recheckRepository.create({
      ...dto,
      userId,
      status: 'pending',
    });
    return this.recheckRepository.save(recheck);
  }

  async findAll(userId: string, status?: string): Promise<Recheck[]> {
    const where: any = { userId };
    if (status) {
      where.status = status;
    }
    return this.recheckRepository.find({
      where,
      order: { dueDate: 'ASC' },
    });
  }

  async findPending(userId: string): Promise<Recheck[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.recheckRepository.find({
      where: {
        userId,
        status: In(['pending', 'scheduled']),
        dueDate: MoreThanOrEqual(today),
      },
      order: { dueDate: 'ASC' },
    });
  }

  async findOne(id: string, userId: string): Promise<Recheck> {
    const recheck = await this.recheckRepository.findOne({ where: { id } });
    if (!recheck) {
      throw new NotFoundException('复查记录不存在');
    }
    if (recheck.userId !== userId) {
      throw new ForbiddenException('无权访问此复查记录');
    }
    return recheck;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateRecheckDto,
  ): Promise<Recheck> {
    const recheck = await this.findOne(id, userId);
    Object.assign(recheck, dto);
    return this.recheckRepository.save(recheck);
  }

  async schedule(
    id: string,
    userId: string,
    dto: ScheduleRecheckDto,
  ): Promise<Recheck> {
    const recheck = await this.findOne(id, userId);
    recheck.appointmentDate = new Date(dto.appointmentDate);
    recheck.hospital = dto.hospital;
    recheck.status = 'scheduled';
    const savedRecheck = await this.recheckRepository.save(recheck);
    await this.familyService.createHealthEventRecords(
      userId,
      'recheck',
      savedRecheck.id,
      `已预约${savedRecheck.checkType}复查，预约日期 ${dto.appointmentDate}。`,
    );
    return savedRecheck;
  }

  async complete(id: string, userId: string): Promise<Recheck> {
    const recheck = await this.findOne(id, userId);
    recheck.status = 'completed';
    recheck.completedAt = new Date();
    const savedRecheck = await this.recheckRepository.save(recheck);
    await this.familyService.createHealthEventRecords(
      userId,
      'recheck',
      savedRecheck.id,
      `已完成${savedRecheck.checkType}复查，请关注后续结果。`,
    );
    return savedRecheck;
  }

  async remove(id: string, userId: string): Promise<void> {
    const recheck = await this.findOne(id, userId);
    await this.recheckRepository.remove(recheck);
  }
}
