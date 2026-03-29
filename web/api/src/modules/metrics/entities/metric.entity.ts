import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('health_metrics')
export class HealthMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (user) => user.metrics)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ length: 30 })
  type: string; // blood_pressure/blood_sugar/weight/heart_rate

  @Column({ nullable: true })
  systolic: number; // for blood pressure

  @Column({ nullable: true })
  diastolic: number; // for blood pressure

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  value: number; // for sugar, weight, etc.

  @Column({ length: 20 })
  unit: string;

  @Column({ name: 'measured_at', type: 'timestamp' })
  measuredAt: Date;

  @Column({ length: 30, nullable: true })
  timing: string; // fasting/before_meal/after_meal/bedtime

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
