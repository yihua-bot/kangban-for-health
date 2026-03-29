import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MetricsService } from './metrics.service';
import { CreateBloodPressureDto } from './dto/create-blood-pressure.dto';
import { CreateBloodSugarDto } from './dto/create-blood-sugar.dto';

@ApiTags('健康指标')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Post('blood-pressure')
  @ApiOperation({ summary: '记录血压' })
  async recordBloodPressure(
    @Request() req: any,
    @Body() dto: CreateBloodPressureDto,
  ) {
    return this.metricsService.recordBloodPressure(req.user.id, dto);
  }

  @Post('blood-sugar')
  @ApiOperation({ summary: '记录血糖' })
  async recordBloodSugar(
    @Request() req: any,
    @Body() dto: CreateBloodSugarDto,
  ) {
    return this.metricsService.recordBloodSugar(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: '查询健康指标列表' })
  @ApiQuery({ name: 'type', required: false, description: '指标类型 (blood_pressure/blood_sugar/weight/heart_rate)' })
  @ApiQuery({ name: 'days', required: false, description: '查询天数', example: 7 })
  async findAll(
    @Request() req: any,
    @Query('type') type?: string,
    @Query('days') days?: number,
  ) {
    return this.metricsService.findAll(req.user.id, type, days ? +days : 7);
  }

  @Get('stats')
  @ApiOperation({ summary: '获取健康指标统计' })
  @ApiQuery({ name: 'type', required: true, description: '指标类型' })
  @ApiQuery({ name: 'days', required: false, description: '统计天数', example: 7 })
  async getStats(
    @Request() req: any,
    @Query('type') type: string,
    @Query('days') days?: number,
  ) {
    return this.metricsService.getStats(req.user.id, type, days ? +days : 7);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除健康指标记录' })
  async remove(@Request() req: any, @Param('id') id: string) {
    await this.metricsService.remove(id, req.user.id);
    return { message: '删除成功' };
  }
}
