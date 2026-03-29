import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { HealthMetric } from './entities/metric.entity';
import { HealthTask } from '../tasks/entities/task.entity';
import { FamilyModule } from '../family/family.module';
import { Recheck } from '../rechecks/entities/recheck.entity';

@Module({
  imports: [TypeOrmModule.forFeature([HealthMetric, HealthTask, Recheck]), FamilyModule],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
