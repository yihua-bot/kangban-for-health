import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsDateString,
  IsOptional,
} from 'class-validator';

export class CreateMedicationDto {
  @ApiProperty({ description: '药品名称', example: '阿司匹林' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: '剂量', example: '10mg' })
  @IsString()
  @IsNotEmpty()
  dosage: string;

  @ApiProperty({ description: '频率', example: '每日一次' })
  @IsString()
  @IsNotEmpty()
  frequency: string;

  @ApiProperty({ description: '服药时间', example: ['早餐后', '晚餐后'] })
  @IsArray()
  @IsString({ each: true })
  timing: string[];

  @ApiProperty({ description: '开始日期', example: '2024-01-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: '结束日期',
    example: '2024-12-31',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ description: '备注', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
