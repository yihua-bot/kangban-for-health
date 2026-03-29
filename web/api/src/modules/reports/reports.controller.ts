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
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';

const REPORT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

@ApiTags('健康报告')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post('upload')
  @ApiOperation({ summary: '上传健康报告' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: REPORT_UPLOAD_MAX_BYTES }, // 25MB
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new BadRequestException('只支持 JPG、PNG、PDF 格式'), false);
      }
    },
  }))
  async uploadReport(
    @Request() req: any,
    @Body() dto: CreateReportDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.reportsService.uploadReport(req.user.id, dto, file);
  }

  @Get()
  @ApiOperation({ summary: '获取用户报告列表（分页）' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '每页数量' })
  async findAll(
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.reportsService.findAllByUser(req.user.id, page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取报告详情（含异常指标）' })
  @ApiParam({ name: 'id', description: '报告ID' })
  async findOne(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reportsService.findOne(id, req.user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新报告（状态/摘要）' })
  @ApiParam({ name: 'id', description: '报告ID' })
  async update(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReportDto,
  ) {
    return this.reportsService.update(id, req.user.id, dto);
  }

  @Post(':id/reparse')
  @ApiOperation({ summary: '重新解析报告' })
  @ApiParam({ name: 'id', description: '报告ID' })
  async reparse(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reportsService.reparse(id, req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除报告' })
  @ApiParam({ name: 'id', description: '报告ID' })
  async remove(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.reportsService.remove(id, req.user.id);
    return { message: '报告已删除' };
  }
}
