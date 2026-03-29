import { Controller, Get, Param, Res, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { AppUpdatesService } from './app-updates.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('应用热更新')
@Controller('app-updates')
export class AppUpdatesController {
  constructor(private readonly appUpdatesService: AppUpdatesService) {}

  @Get('latest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取最新版本信息' })
  getLatest() {
    return this.appUpdatesService.getLatest();
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('bundles/:filename')
  @ApiOperation({ summary: '下载更新包' })
  getBundle(@Param('filename') filename: string, @Res() res: Response) {
    return this.appUpdatesService.serveBundle(filename, res);
  }
}
