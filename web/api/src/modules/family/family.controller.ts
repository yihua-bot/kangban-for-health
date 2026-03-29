import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FamilyService } from './family.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BindFamilyDto } from './dto/bind-family.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';
import { ScheduleRecheckDto } from '../rechecks/dto/schedule-recheck.dto';
import { ClaimRecheckActionDto } from './dto/claim-recheck-action.dto';
import { ReportsService } from '../reports/reports.service';
import { CreateReportDto } from '../reports/dto/create-report.dto';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
import { UpdateTaskDto } from '../tasks/dto/update-task.dto';

const REPORT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

@ApiTags('家属协同')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('family')
export class FamilyController {
  constructor(
    private readonly familyService: FamilyService,
    private readonly reportsService: ReportsService,
  ) {}

  @Post('bind')
  @ApiOperation({ summary: '绑定家属关系' })
  async bindFamilyMember(@Request() req: any, @Body() dto: BindFamilyDto) {
    const userId = req.user.id;
    return this.familyService.bindFamilyMember(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: '获取家属列表或老人列表' })
  async getFamilyMembers(@Request() req: any) {
    const userId = req.user.id;
    const familyMembers = await this.familyService.findFamilyMembers(userId);
    const elders = await this.familyService.findElders(userId);

    return {
      familyMembers,
      elders,
    };
  }

  @Get('elders')
  @ApiOperation({ summary: '获取我监护的老人列表' })
  async getElders(@Request() req: any) {
    const userId = req.user.id;
    return this.familyService.findElders(userId);
  }

  @Get('elders/:elderId/rechecks')
  @ApiOperation({ summary: '获取我监护老人待处理的复查项目' })
  async getElderRechecks(@Request() req: any, @Param('elderId') elderId: string) {
    const userId = req.user.id;
    return this.familyService.getElderRechecks(userId, elderId);
  }

  @Get('elders/:elderId/tasks')
  @ApiOperation({ summary: '获取我监护老人的任务列表' })
  async getElderTasks(@Request() req: any, @Param('elderId') elderId: string) {
    const userId = req.user.id;
    return this.familyService.getElderTasks(userId, elderId);
  }

  @Post('elders/:elderId/tasks')
  @ApiOperation({ summary: '家属代长辈创建任务' })
  async createElderTask(
    @Request() req: any,
    @Param('elderId') elderId: string,
    @Body() dto: CreateTaskDto,
  ) {
    const userId = req.user.id;
    return this.familyService.createElderTask(userId, elderId, dto);
  }

  @Put('elders/:elderId/tasks/:taskId')
  @ApiOperation({ summary: '家属更新长辈任务' })
  async updateElderTask(
    @Request() req: any,
    @Param('elderId') elderId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    const userId = req.user.id;
    return this.familyService.updateElderTask(userId, elderId, taskId, dto);
  }

  @Delete('elders/:elderId/tasks/:taskId')
  @ApiOperation({ summary: '家属删除长辈任务' })
  async deleteElderTask(
    @Request() req: any,
    @Param('elderId') elderId: string,
    @Param('taskId') taskId: string,
  ) {
    const userId = req.user.id;
    await this.familyService.deleteElderTask(userId, elderId, taskId);
    return { message: '任务已删除' };
  }

  @Put('elders/:elderId/rechecks/:recheckId/schedule')
  @ApiOperation({ summary: '家属代老人预约复查' })
  async scheduleElderRecheck(
    @Request() req: any,
    @Param('elderId') elderId: string,
    @Param('recheckId') recheckId: string,
    @Body() dto: ScheduleRecheckDto,
  ) {
    const userId = req.user.id;
    return this.familyService.scheduleElderRecheck(userId, elderId, recheckId, dto);
  }

  @Post('elders/:elderId/rechecks/:recheckId/claim')
  @ApiOperation({ summary: '家属认领复查跟进动作' })
  async claimElderRecheckAction(
    @Request() req: any,
    @Param('elderId') elderId: string,
    @Param('recheckId') recheckId: string,
    @Body() dto: ClaimRecheckActionDto,
  ) {
    const userId = req.user.id;
    return this.familyService.claimElderRecheckAction(
      userId,
      elderId,
      recheckId,
      dto.actionType,
    );
  }

  @Post('elders/:elderId/reports/upload')
  @ApiOperation({ summary: '家属代长辈上传体检报告' })
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: REPORT_UPLOAD_MAX_BYTES },
  }))
  async uploadElderReport(
    @Request() req: any,
    @Param('elderId') elderId: string,
    @Body() dto: CreateReportDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const userId = req.user.id;
    await this.familyService.ensureFamilyAccess(userId, elderId);
    return this.reportsService.uploadReport(elderId, dto, file);
  }

  @Get('elders/:elderId/reports')
  @ApiOperation({ summary: '获取我监护老人最近的体检报告' })
  async getElderReports(@Request() req: any, @Param('elderId') elderId: string) {
    const userId = req.user.id;
    await this.familyService.ensureFamilyAccess(userId, elderId);
    const reports = await this.reportsService.findAllByUser(elderId, 1, 5);
    return reports.data;
  }

  @Get('sync-records')
  @ApiOperation({ summary: '获取同步记录' })
  async getSyncRecords(@Request() req: any) {
    const userId = req.user.id;
    return this.familyService.getSyncRecords(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取家属关系详情' })
  async getFamilyMember(@Request() req: any, @Param('id') id: string) {
    const userId = req.user.id;
    return this.familyService.findOne(id, userId);
  }

  @Put(':id/permissions')
  @ApiOperation({ summary: '更新家属权限' })
  async updatePermissions(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdatePermissionsDto,
  ) {
    const userId = req.user.id;
    return this.familyService.updatePermissions(id, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '解除家属关系' })
  async unbindFamilyMember(@Request() req: any, @Param('id') id: string) {
    const userId = req.user.id;
    return this.familyService.unbind(id, userId);
  }

  @Post('sync/:elderId')
  @ApiOperation({ summary: '手动触发同步' })
  async triggerSync(@Request() req: any, @Param('elderId') elderId: string) {
    const userId = req.user.id;
    return this.familyService.triggerSync(userId, elderId);
  }
}
