import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MedicationsController } from './medications.controller';
import { MedicationsService } from './medications.service';
import { Medication } from './entities/medication.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Medication])],
  controllers: [MedicationsController],
  providers: [MedicationsService],
  exports: [MedicationsService],
})
export class MedicationsModule {}
