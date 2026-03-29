import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RechecksController } from './rechecks.controller';
import { RechecksService } from './rechecks.service';
import { Recheck } from './entities/recheck.entity';
import { FamilyModule } from '../family/family.module';

@Module({
  imports: [TypeOrmModule.forFeature([Recheck]), FamilyModule],
  controllers: [RechecksController],
  providers: [RechecksService],
  exports: [RechecksService],
})
export class RechecksModule {}
