import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { HealthReport } from '../../reports/entities/report.entity';

@Entity('rechecks')
export class Recheck {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'report_id', nullable: true })
  reportId: string;

  @ManyToOne(() => HealthReport, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'report_id' })
  report: HealthReport;

  @Column({ name: 'item_name', length: 100 })
  itemName: string;

  @Column({ name: 'check_type', length: 50 })
  checkType: string; // 血压/血糖/CT/B超/等

  @Column({ name: 'due_date', type: 'date' })
  dueDate: Date;

  @Column({ length: 200, nullable: true })
  hospital: string;

  @Column({ name: 'appointment_date', type: 'date', nullable: true })
  appointmentDate: Date;

  @Column({ length: 20, default: 'pending' })
  status: string; // pending/scheduled/completed/overdue

  @Column({ name: 'reminder_enabled', default: true })
  reminderEnabled: boolean;

  @Column({ name: 'reminder_days', default: 3 })
  reminderDays: number; // 提前几天提醒

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
