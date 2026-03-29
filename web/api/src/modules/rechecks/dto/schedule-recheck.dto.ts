import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString, IsNotEmpty } from 'class-validator';

export class ScheduleRecheckDto {
  @ApiProperty({ description: '预约日期' })
  @IsDateString()
  appointmentDate: string;

  @ApiProperty({ description: '医院名称' })
  @IsString()
  @IsNotEmpty()
  hospital: string;
}
