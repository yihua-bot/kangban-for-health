import { IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePermissionsDto {
  @ApiProperty({ description: '是否可查看报告', required: false })
  @IsOptional()
  @IsBoolean()
  canViewReports?: boolean;

  @ApiProperty({ description: '是否可查看指标', required: false })
  @IsOptional()
  @IsBoolean()
  canViewMetrics?: boolean;

  @ApiProperty({ description: '是否启用通知', required: false })
  @IsOptional()
  @IsBoolean()
  notificationEnabled?: boolean;
}
