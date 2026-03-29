import { Controller, Get, Put, Post, Delete, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { RemovePushTokenDto } from './dto/remove-push-token.dto';
import { SetPasswordDto } from './dto/set-password.dto';

@ApiTags('用户')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('compliance-docs')
  @ApiOperation({ summary: '获取用户协议/隐私政策/医疗免责声明' })
  async getComplianceDocs() {
    return this.usersService.getComplianceDocs();
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取用户资料' })
  async getProfile(@Request() req: any) {
    return this.usersService.getProfile(req.user.id);
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新用户资料' })
  async updateProfile(@Request() req: any, @Body() dto: UpdateUserDto) {
    return this.usersService.update(req.user.id, dto);
  }

  @Put('password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '设置或修改登录密码' })
  async setPassword(@Request() req: any, @Body() dto: SetPasswordDto) {
    return this.usersService.setPassword(req.user.id, dto.password);
  }

  @Post('push-tokens')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '注册客户端 Push Token' })
  async registerPushToken(
    @Request() req: any,
    @Body() dto: RegisterPushTokenDto,
  ) {
    return this.usersService.registerPushToken(req.user.id, dto);
  }

  @Delete('push-tokens')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '注销客户端 Push Token' })
  async removePushToken(
    @Request() req: any,
    @Body() dto: RemovePushTokenDto,
  ) {
    return this.usersService.removePushToken(req.user.id, dto.token);
  }

  @Delete('account')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '注销当前账号并删除数据' })
  async deleteAccount(@Request() req: any) {
    return this.usersService.deleteAccount(req.user.id);
  }
}
