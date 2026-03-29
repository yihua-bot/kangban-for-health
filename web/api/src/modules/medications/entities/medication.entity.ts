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

@Entity('medications')
export class Medication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (user) => user.medications)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 100 })
  dosage: string;

  @Column({ length: 50 })
  frequency: string; // 每日一次/每日两次/等

  @Column({ type: 'simple-array' })
  timing: string[]; // ['早餐后', '晚餐后']

  @Column({ name: 'start_date', type: 'date' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: Date;

  @Column({ default: true })
  active: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
