import { Controller, Post, Body, UseGuards, Get, Request, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  AdminLoginDto,
  SendLoginCodeDto,
  CodeLoginDto,
  SendEmailLoginCodeDto,
  EmailCodeLoginDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('register')
  @ApiOperation({ summary: '用户注册' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    res.cookie('access_token', result.access_token, COOKIE_OPTIONS);
    return { access_token: result.access_token, user: result.user };
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @ApiOperation({ summary: '用户登录' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    res.cookie('access_token', result.access_token, COOKIE_OPTIONS);
    return { access_token: result.access_token, user: result.user };
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('login/code/send')
  @ApiOperation({ summary: '发送登录验证码' })
  async sendLoginCode(@Body() dto: SendLoginCodeDto) {
    return this.authService.sendLoginCode(dto);
  }

  @Post('login/code')
  @ApiOperation({ summary: '验证码登录' })
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  async loginWithCode(
    @Body() dto: CodeLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.loginWithCode(dto);
    res.cookie('access_token', result.access_token, COOKIE_OPTIONS);
    return { access_token: result.access_token, user: result.user };
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('login/email-code/send')
  @ApiOperation({ summary: '发送邮箱登录验证码' })
  async sendEmailLoginCode(@Body() dto: SendEmailLoginCodeDto) {
    return this.authService.sendEmailLoginCode(dto);
  }

  @Post('login/email-code')
  @ApiOperation({ summary: '邮箱验证码登录' })
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  async loginWithEmailCode(
    @Body() dto: EmailCodeLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.loginWithEmailCode(dto);
    res.cookie('access_token', result.access_token, COOKIE_OPTIONS);
    return { access_token: result.access_token, user: result.user };
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('admin-login')
  @ApiOperation({ summary: '超级管理员登录' })
  async adminLogin(
    @Body() dto: AdminLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.adminLogin(dto);
    res.cookie('access_token', result.access_token, COOKIE_OPTIONS);
    return { access_token: result.access_token, user: result.user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '退出登录' })
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token', { path: '/' });
    return { message: '已退出登录' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户信息' })
  async getProfile(@Request() req: any) {
    return req.user;
  }
}
