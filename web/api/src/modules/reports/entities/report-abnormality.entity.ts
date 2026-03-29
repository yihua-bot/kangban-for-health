import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { HealthReport } from './report.entity';

@Entity('report_abnormalities')
export class ReportAbnormality {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'report_id' })
  reportId: string;

  @ManyToOne(() => HealthReport, (report) => report.abnormalities, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'report_id' })
  report: HealthReport;

  @Column({ name: 'item_name', length: 100 })
  itemName: string;

  @Column({ length: 50 })
  value: string;

  @Column({ length: 30 })
  unit: string;

  @Column({ name: 'reference_range', length: 50 })
  referenceRange: string;

  @Column({ length: 20 })
  severity: string; // normal/mild/moderate/severe

  @Column({ name: 'risk_level', length: 20 })
  riskLevel: string; // low/medium/high/urgent

  @Column({ length: 50 })
  category: string; // 血压/血糖/血脂/肝功能/肾功能

  @Column({ name: 'doctor_advice', type: 'text', nullable: true })
  doctorAdvice: string;

  @Column({ name: 'follow_up_required', default: false })
  followUpRequired: boolean;

  @Column({ name: 'follow_up_period', nullable: true })
  followUpPeriod: number; // days

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
