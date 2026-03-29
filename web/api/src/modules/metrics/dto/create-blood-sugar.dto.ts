import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  Min,
  Max,
  IsOptional,
  IsDateString,
  IsString,
} from 'class-validator';

export class CreateBloodSugarDto {
  @ApiProperty({ description: '血糖值 (mmol/L)', example: 5.6 })
  @IsNumber()
  @Min(1)
  @Max(35)
  value: number;

  @ApiPropertyOptional({
    description: '测量时机',
    example: 'fasting',
    enum: ['fasting', 'before_meal', 'after_meal', 'bedtime'],
  })
  @IsOptional()
  @IsString()
  timing?: string;

  @ApiPropertyOptional({ description: '测量时间', example: '2024-01-15T08:30:00Z' })
  @IsOptional()
  @IsDateString()
  measuredAt?: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  notes?: string;
}
