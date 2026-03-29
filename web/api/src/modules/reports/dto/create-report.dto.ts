import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReportDto {
  @ApiPropertyOptional({ description: '报告类型', example: '年度体检' })
  @IsString()
  @IsOptional()
  reportType?: string;

  @ApiPropertyOptional({ description: '报告日期', example: '2024-01-15' })
  @IsDateString()
  @IsOptional()
  reportDate?: string;

  @ApiPropertyOptional({ description: '医院名称', example: '北京协和医院' })
  @IsString()
  @IsOptional()
  hospital?: string;

  @ApiPropertyOptional({
    description: '报告文件',
    type: 'string',
    format: 'binary',
  })
  @IsOptional()
  file?: any;
}
