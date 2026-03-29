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

@Entity('family_members')
export class FamilyMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User; // The family member (子女)

  @Column({ name: 'elder_user_id' })
  elderUserId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'elder_user_id' })
  elderUser: User; // The elder being monitored

  @Column({ length: 20 })
  relationship: string; // 子女/配偶/其他

  @Column({ name: 'can_view_reports', default: true })
  canViewReports: boolean;

  @Column({ name: 'can_view_metrics', default: true })
  canViewMetrics: boolean;

  @Column({ name: 'notification_enabled', default: true })
  notificationEnabled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
