import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsDateString,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class CreateRecheckDto {
  @ApiPropertyOptional({ description: '关联的体检报告ID' })
  @IsOptional()
  @IsUUID()
  reportId?: string;

  @ApiProperty({ description: '复查项目名称' })
  @IsString()
  @IsNotEmpty()
  itemName: string;

  @ApiProperty({ description: '检查类型' })
  @IsString()
  @IsNotEmpty()
  checkType: string;

  @ApiProperty({ description: '应复查日期' })
  @IsDateString()
  dueDate: string;

  @ApiPropertyOptional({ description: '医院名称' })
  @IsOptional()
  @IsString()
  hospital?: string;

  @ApiPropertyOptional({ description: '是否启用提醒', default: true })
  @IsOptional()
  @IsBoolean()
  reminderEnabled?: boolean;

  @ApiPropertyOptional({ description: '提前提醒天数', default: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  reminderDays?: number;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  notes?: string;
}
