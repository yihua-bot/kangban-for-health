import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  Min,
  Max,
  IsOptional,
  IsDateString,
  IsString,
} from 'class-validator';

export class CreateBloodPressureDto {
  @ApiProperty({ description: '收缩压 (mmHg)', example: 120 })
  @IsInt()
  @Min(60)
  @Max(250)
  systolic: number;

  @ApiProperty({ description: '舒张压 (mmHg)', example: 80 })
  @IsInt()
  @Min(40)
  @Max(150)
  diastolic: number;

  @ApiPropertyOptional({ description: '测量时间', example: '2024-01-15T08:30:00Z' })
  @IsOptional()
  @IsDateString()
  measuredAt?: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  notes?: string;
}
