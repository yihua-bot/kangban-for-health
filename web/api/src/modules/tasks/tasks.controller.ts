import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@ApiTags('任务')
@Controller('tasks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({ summary: '创建任务' })
  async create(@Request() req: any, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: '获取任务列表' })
  async findAll(
    @Request() req: any,
    @Query('type') type?: string,
    @Query('completed') completed?: string,
    @Query('date') date?: string,
  ) {
    const filters: any = {};
    if (type) filters.type = type;
    if (completed !== undefined) filters.completed = completed === 'true';
    if (date) filters.date = date;

    return this.tasksService.findAll(req.user.id, filters);
  }

  @Get('today')
  @ApiOperation({ summary: '获取今日任务' })
  async findTodayTasks(@Request() req: any) {
    return this.tasksService.findTodayTasks(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取单个任务' })
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.tasksService.findOne(id, req.user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新任务' })
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(id, req.user.id, dto);
  }

  @Put(':id/complete')
  @ApiOperation({ summary: '完成任务' })
  async complete(@Request() req: any, @Param('id') id: string) {
    return this.tasksService.complete(id, req.user.id);
  }

  @Put(':id/uncomplete')
  @ApiOperation({ summary: '取消完成任务' })
  async uncomplete(@Request() req: any, @Param('id') id: string) {
    return this.tasksService.uncomplete(id, req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除任务' })
  async remove(@Request() req: any, @Param('id') id: string) {
    await this.tasksService.remove(id, req.user.id);
    return { message: '任务已删除' };
  }
}
