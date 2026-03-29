import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from '../users/entities/user.entity';
import { HealthReport } from '../reports/entities/report.entity';
import { ReportAbnormality } from '../reports/entities/report-abnormality.entity';
import { HealthMetric } from '../metrics/entities/metric.entity';
import { HealthTask } from '../tasks/entities/task.entity';
import { AdminAuthGuard } from './admin-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      HealthReport,
      ReportAbnormality,
      HealthMetric,
      HealthTask,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminAuthGuard],
  exports: [AdminService],
})
export class AdminModule {}
