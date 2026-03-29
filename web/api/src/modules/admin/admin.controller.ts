import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminAuthGuard } from './admin-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('管理后台')
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminAuthGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard/stats')
  @ApiOperation({ summary: '获取仪表盘统计数据' })
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('dashboard/recent-activity')
  @ApiOperation({ summary: '获取最近活动' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getRecentActivity(@Query('limit') limit?: number) {
    return this.adminService.getRecentActivity(limit ? +limit : 10);
  }

  @Get('dashboard/abnormal-alerts')
  @ApiOperation({ summary: '获取异常提醒' })
  async getAbnormalAlerts() {
    return this.adminService.getAbnormalAlerts();
  }

  @Get('users')
  @ApiOperation({ summary: '获取所有用户' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  async getAllUsers(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.adminService.getAllUsers(
      page ? +page : 1,
      limit ? +limit : 20,
      search,
    );
  }

  @Get('reports')
  @ApiOperation({ summary: '获取所有报告' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  async getAllReports(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
  ) {
    return this.adminService.getAllReports(
      page ? +page : 1,
      limit ? +limit : 20,
      status,
    );
  }

  @Get('metrics/stats')
  @ApiOperation({ summary: '获取指标统计' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  async getMetricsStats(@Query('days') days?: number) {
    return this.adminService.getMetricsStats(days ? +days : 30);
  }

  @Get('compliance-docs')
  @ApiOperation({ summary: '获取协议与免责声明配置' })
  async getComplianceDocs() {
    return this.adminService.getComplianceDocs();
  }

  @Put('compliance-docs')
  @ApiOperation({ summary: '更新协议与免责声明配置' })
  async updateComplianceDocs(
    @Body()
    payload: {
      privacy?: string;
      terms?: string;
      medical?: string;
      dataDeletion?: string;
    },
  ) {
    return this.adminService.updateComplianceDocs(payload);
  }
}
