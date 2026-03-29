import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class UpdateReportAbnormalityDto {
  @ApiProperty({ description: '异常项目名称', example: '空腹血糖' })
  @IsString()
  itemName: string;

  @ApiProperty({ description: '检测值', example: '7.2' })
  @IsString()
  value: string;

  @ApiProperty({ description: '单位', example: 'mmol/L' })
  @IsString()
  unit: string;

  @ApiProperty({ description: '参考范围', example: '3.9-6.1' })
  @IsString()
  referenceRange: string;

  @ApiPropertyOptional({
    description: '异常程度',
    example: 'mild',
    enum: ['mild', 'moderate', 'severe', 'normal'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['mild', 'moderate', 'severe', 'normal'])
  severity?: string;

  @ApiPropertyOptional({
    description: '风险等级',
    example: 'medium',
    enum: ['low', 'medium', 'high', 'urgent'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['low', 'medium', 'high', 'urgent'])
  riskLevel?: string;

  @ApiPropertyOptional({ description: '指标分类', example: '血糖' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: '医生建议', example: '建议 30 天后复查空腹血糖。' })
  @IsOptional()
  @IsString()
  doctorAdvice?: string;

  @ApiPropertyOptional({ description: '是否需要复查', example: true })
  @IsOptional()
  @IsBoolean()
  followUpRequired?: boolean;

  @ApiPropertyOptional({ description: '复查周期（天）', example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  followUpPeriod?: number;
}

export class UpdateReportDto {
  @ApiPropertyOptional({
    description: '报告状态',
    example: 'reviewed',
    enum: ['pending', 'processed', 'reviewed'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['pending', 'processed', 'reviewed'])
  status?: string;

  @ApiPropertyOptional({
    description: 'AI 分析摘要',
    example: '体检结果整体良好，血脂偏高需注意饮食',
  })
  @IsOptional()
  @IsString()
  aiSummary?: string;

  @ApiPropertyOptional({
    description: '人工校正后的异常项列表，提交后会重建该报告的任务与复查安排',
    type: [UpdateReportAbnormalityDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateReportAbnormalityDto)
  abnormalities?: UpdateReportAbnormalityDto[];
}
