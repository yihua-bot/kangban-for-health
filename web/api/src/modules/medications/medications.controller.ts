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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { MedicationsService } from './medications.service';
import { CreateMedicationDto } from './dto/create-medication.dto';
import { UpdateMedicationDto } from './dto/update-medication.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('用药管理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('medications')
export class MedicationsController {
  constructor(private readonly medicationsService: MedicationsService) {}

  @Post()
  @ApiOperation({ summary: '创建用药记录' })
  @ApiResponse({ status: 201, description: '创建成功' })
  async create(@Request() req: any, @Body() createMedicationDto: CreateMedicationDto) {
    const userId = req.user.id;
    return await this.medicationsService.create(userId, createMedicationDto);
  }

  @Get()
  @ApiOperation({ summary: '获取所有用药记录' })
  @ApiResponse({ status: 200, description: '获取成功' })
  async findAll(@Request() req: any) {
    const userId = req.user.id;
    return await this.medicationsService.findAll(userId);
  }

  @Get('active')
  @ApiOperation({ summary: '获取活跃的用药记录' })
  @ApiResponse({ status: 200, description: '获取成功' })
  async findActive(@Request() req: any) {
    const userId = req.user.id;
    return await this.medicationsService.findActive(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取单个用药记录' })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 404, description: '记录不存在' })
  async findOne(@Request() req: any, @Param('id') id: string) {
    const userId = req.user.id;
    return await this.medicationsService.findOne(id, userId);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新用药记录' })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '记录不存在' })
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() updateMedicationDto: UpdateMedicationDto,
  ) {
    const userId = req.user.id;
    return await this.medicationsService.update(id, userId, updateMedicationDto);
  }

  @Put(':id/deactivate')
  @ApiOperation({ summary: '停用用药记录' })
  @ApiResponse({ status: 200, description: '停用成功' })
  @ApiResponse({ status: 404, description: '记录不存在' })
  async deactivate(@Request() req: any, @Param('id') id: string) {
    const userId = req.user.id;
    return await this.medicationsService.deactivate(id, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除用药记录' })
  @ApiResponse({ status: 204, description: '删除成功' })
  @ApiResponse({ status: 404, description: '记录不存在' })
  async remove(@Request() req: any, @Param('id') id: string) {
    const userId = req.user.id;
    await this.medicationsService.remove(id, userId);
  }
}
