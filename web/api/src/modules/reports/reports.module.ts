import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { HealthReport } from './entities/report.entity';
import { ReportAbnormality } from './entities/report-abnormality.entity';
import { HealthTask } from '../tasks/entities/task.entity';
import { Recheck } from '../rechecks/entities/recheck.entity';
import { FamilyModule } from '../family/family.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageService } from '../../common/storage/storage.service';

@Module({
  imports: [
    forwardRef(() => FamilyModule),
    NotificationsModule,
    TypeOrmModule.forFeature([
      HealthReport,
      ReportAbnormality,
      HealthTask,
      Recheck,
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService, StorageService],
  exports: [ReportsService],
})
export class ReportsModule {}

