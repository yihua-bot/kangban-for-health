import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FamilyController } from './family.controller';
import { FamilyService } from './family.service';
import { FamilyMember } from './entities/family-member.entity';
import { SyncRecord } from './entities/sync-record.entity';
import { User } from '../users/entities/user.entity';
import { Recheck } from '../rechecks/entities/recheck.entity';
import { HealthTask } from '../tasks/entities/task.entity';
import { ReportsModule } from '../reports/reports.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    forwardRef(() => ReportsModule),
    TypeOrmModule.forFeature([FamilyMember, SyncRecord, User, Recheck, HealthTask]),
  ],
  controllers: [FamilyController],
  providers: [FamilyService],
  exports: [FamilyService],
})
export class FamilyModule {}
