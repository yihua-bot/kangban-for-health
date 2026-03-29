import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsDateString,
  MaxLength,
} from 'class-validator';

export class CreateTaskDto {
  @ApiProperty({ description: '关联报告ID', required: false })
  @IsOptional()
  @IsString()
  reportId?: string;

  @ApiProperty({
    description: '任务类型',
    enum: ['measurement', 'medication', 'recheck', 'lifestyle'],
  })
  @IsEnum(['measurement', 'medication', 'recheck', 'lifestyle'])
  type: string;

  @ApiProperty({ description: '任务标题' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: '任务描述', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: '重复频率',
    enum: ['once', 'daily', 'weekly', 'monthly'],
    default: 'daily',
  })
  @IsOptional()
  @IsEnum(['once', 'daily', 'weekly', 'monthly'])
  recurrence?: string;

  @ApiProperty({ description: '计划时间 (HH:mm:ss)', required: false })
  @IsOptional()
  @IsString()
  scheduledTime?: string;

  @ApiProperty({ description: '截止日期 (YYYY-MM-DD)', required: false })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiProperty({ description: '是否启用语音提醒', default: true })
  @IsOptional()
  @IsBoolean()
  voiceEnabled?: boolean;

  @ApiProperty({
    description: '优先级',
    enum: ['low', 'medium', 'high'],
    default: 'medium',
  })
  @IsOptional()
  @IsEnum(['low', 'medium', 'high'])
  priority?: string;

  @ApiProperty({
    description: '创建角色',
    enum: ['self', 'family'],
    default: 'self',
    required: false,
  })
  @IsOptional()
  @IsEnum(['self', 'family'])
  creatorRole?: string;
}
