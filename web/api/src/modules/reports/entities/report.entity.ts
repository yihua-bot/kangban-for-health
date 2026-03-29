import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ReportAbnormality } from './report-abnormality.entity';
import { HealthTask } from '../../tasks/entities/task.entity';

@Entity('health_reports')
export class HealthReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (user) => user.reports)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'report_type', length: 50 })
  reportType: string; // 年度体检/专项检查/复查

  @Column({ name: 'report_date', type: 'date' })
  reportDate: Date;

  @Column({ length: 200 })
  hospital: string;

  @Column({ name: 'ai_summary', type: 'text', nullable: true })
  aiSummary: string;

  @Column({ name: 'ocr_data', type: 'jsonb', nullable: true })
  ocrData: any;

  @Column({ length: 20, default: 'pending' })
  status: string; // pending/processed/reviewed

  @Column({ name: 'file_url', length: 500, nullable: true })
  fileUrl?: string;

  @OneToMany(() => ReportAbnormality, (abnormality) => abnormality.report, {
    cascade: true,
  })
  abnormalities: ReportAbnormality[];

  @OneToMany(() => HealthTask, (task) => task.report)
  tasks: HealthTask[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
