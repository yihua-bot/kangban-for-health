import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RechecksService } from './rechecks.service';
import { CreateRecheckDto } from './dto/create-recheck.dto';
import { UpdateRecheckDto } from './dto/update-recheck.dto';
import { ScheduleRecheckDto } from './dto/schedule-recheck.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('复查管理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('rechecks')
export class RechecksController {
  constructor(private readonly rechecksService: RechecksService) {}

  @Post()
  @ApiOperation({ summary: '创建复查记录' })
  create(@Request() req: any, @Body() dto: CreateRecheckDto) {
    return this.rechecksService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: '获取复查记录列表' })
  findAll(@Request() req: any, @Query('status') status?: string) {
    return this.rechecksService.findAll(req.user.id, status);
  }

  @Get('pending')
  @ApiOperation({ summary: '获取待复查记录' })
  findPending(@Request() req: any) {
    return this.rechecksService.findPending(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取单个复查记录' })
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.rechecksService.findOne(id, req.user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新复查记录' })
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateRecheckDto,
  ) {
    return this.rechecksService.update(id, req.user.id, dto);
  }

  @Put(':id/schedule')
  @ApiOperation({ summary: '预约复查' })
  schedule(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: ScheduleRecheckDto,
  ) {
    return this.rechecksService.schedule(id, req.user.id, dto);
  }

  @Put(':id/complete')
  @ApiOperation({ summary: '标记为已完成' })
  complete(@Request() req: any, @Param('id') id: string) {
    return this.rechecksService.complete(id, req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除复查记录' })
  remove(@Request() req: any, @Param('id') id: string) {
    return this.rechecksService.remove(id, req.user.id);
  }
}
