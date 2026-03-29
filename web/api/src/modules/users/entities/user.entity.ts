import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Exclude } from 'class-transformer';
import { FamilyMember } from '../../family/entities/family-member.entity';
import { HealthReport } from '../../reports/entities/report.entity';
import { HealthTask } from '../../tasks/entities/task.entity';
import { HealthMetric } from '../../metrics/entities/metric.entity';
import { Medication } from '../../medications/entities/medication.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  phone: string;

  @Column({ unique: true, nullable: true })
  email?: string;

  @Column()
  @Exclude()
  password: string;

  @Column()
  name: string;

  @Column({ type: 'int', nullable: true })
  age: number;

  @Column({ nullable: true })
  avatar: string;

  @Column('simple-array', { default: '' })
  healthTags: string[];

  @Column({ default: false })
  isFamilyMember: boolean;

  @Column({ nullable: true })
  elderUserId: string; // 关联的老人ID

  @Column({ default: true })
  notifyAbnormal: boolean;

  @Column({ default: true })
  notifyMedication: boolean;

  @Column({ default: true })
  voiceReminder: boolean;

  @OneToMany(() => FamilyMember, (member) => member.user)
  familyMembers: FamilyMember[];

  @OneToMany(() => HealthReport, (report) => report.user)
  reports: HealthReport[];

  @OneToMany(() => HealthTask, (task) => task.user)
  tasks: HealthTask[];

  @OneToMany(() => HealthMetric, (metric) => metric.user)
  metrics: HealthMetric[];

  @OneToMany(() => Medication, (med) => med.user)
  medications: Medication[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
