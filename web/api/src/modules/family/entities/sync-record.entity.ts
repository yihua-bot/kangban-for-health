import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { FamilyMember } from './family-member.entity';

@Entity('sync_records')
export class SyncRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'elder_user_id' })
  elderUserId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'elder_user_id' })
  elderUser: User;

  @Column({ name: 'family_member_id' })
  familyMemberId: string;

  @ManyToOne(() => FamilyMember, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'family_member_id' })
  familyMember: FamilyMember;

  @Column({ name: 'sync_type', length: 30 })
  syncType: string; // report/metric/task/recheck

  @Column({ name: 'entity_id' })
  entityId: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @CreateDateColumn({ name: 'synced_at' })
  syncedAt: Date;
}
