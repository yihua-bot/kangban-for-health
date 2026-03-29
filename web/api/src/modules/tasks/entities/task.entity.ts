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

@Entity('health_tasks')
export class HealthTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (user) => user.tasks)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'report_id', nullable: true })
  reportId: string;

  @ManyToOne(() => HealthReport, (report) => report.tasks, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'report_id' })
  report: HealthReport;

  @Column({ length: 20 })
  type: string; // measurement/medication/recheck/lifestyle

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 20, default: 'daily' })
  recurrence: string; // once/daily/weekly/monthly

  @Column({ name: 'scheduled_time', type: 'time', nullable: true })
  scheduledTime: string;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: Date;

  @Column({ default: false })
  completed: boolean;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ name: 'voice_enabled', default: true })
  voiceEnabled: boolean;

  @Column({ length: 20, default: 'medium' })
  priority: string; // low/medium/high

  @Column({ name: 'creator_role', length: 20, default: 'self' })
  creatorRole: string; // self/family/system

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
