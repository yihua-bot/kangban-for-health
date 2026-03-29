import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, IsNull } from 'typeorm';
import { Medication } from './entities/medication.entity';
import { CreateMedicationDto } from './dto/create-medication.dto';
import { UpdateMedicationDto } from './dto/update-medication.dto';

@Injectable()
export class MedicationsService {
  constructor(
    @InjectRepository(Medication)
    private readonly medicationRepository: Repository<Medication>,
  ) {}

  async create(
    userId: string,
    createMedicationDto: CreateMedicationDto,
  ): Promise<Medication> {
    const medication = this.medicationRepository.create({
      ...createMedicationDto,
      userId,
      active: true,
    });
    return await this.medicationRepository.save(medication);
  }

  async findAll(userId: string): Promise<Medication[]> {
    return await this.medicationRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findActive(userId: string): Promise<Medication[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return await this.medicationRepository
      .createQueryBuilder('medication')
      .where('medication.userId = :userId', { userId })
      .andWhere('medication.active = :active', { active: true })
      .andWhere(
        '(medication.endDate IS NULL OR medication.endDate >= :today)',
        { today },
      )
      .orderBy('medication.createdAt', 'DESC')
      .getMany();
  }

  async findOne(id: string, userId: string): Promise<Medication> {
    const medication = await this.medicationRepository.findOne({
      where: { id },
    });

    if (!medication) {
      throw new NotFoundException('用药记录不存在');
    }

    if (medication.userId !== userId) {
      throw new ForbiddenException('无权访问此用药记录');
    }

    return medication;
  }

  async update(
    id: string,
    userId: string,
    updateMedicationDto: UpdateMedicationDto,
  ): Promise<Medication> {
    const medication = await this.findOne(id, userId);

    Object.assign(medication, updateMedicationDto);
    return await this.medicationRepository.save(medication);
  }

  async deactivate(id: string, userId: string): Promise<Medication> {
    const medication = await this.findOne(id, userId);
    medication.active = false;
    return await this.medicationRepository.save(medication);
  }

  async remove(id: string, userId: string): Promise<void> {
    const medication = await this.findOne(id, userId);
    await this.medicationRepository.remove(medication);
  }
}
