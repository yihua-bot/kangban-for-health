import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { HealthTask } from './entities/task.entity';
import { HealthReport } from '../reports/entities/report.entity';

@Module({
  imports: [TypeOrmModule.forFeature([HealthTask, HealthReport])],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
