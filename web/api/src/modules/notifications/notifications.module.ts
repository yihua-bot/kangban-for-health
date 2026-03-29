import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { FamilyMember } from '../family/entities/family-member.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FamilyMember])],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
