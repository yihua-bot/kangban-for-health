import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from '@nestjs/cache-manager';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { createHmac, timingSafeEqual } from 'crypto';
import { User } from '../users/entities/user.entity';
import {
  RegisterDto,
  LoginDto,
  AdminLoginDto,
  SendLoginCodeDto,
  CodeLoginDto,
  SendEmailLoginCodeDto,
  EmailCodeLoginDto,
} from './dto/auth.dto';
import { AuthEmailService } from './auth-email.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly isProduction = process.env.NODE_ENV === 'production';
  private readonly universalCode: string | undefined = (() => {
    const code = process.env.LOGIN_UNIVERSAL_CODE?.trim() || undefined;
    if (!code) return undefined;
    if (this.isProduction) return undefined;
    return code;
  })();
  private readonly codeExpireMs = 5 * 60 * 1000;
  private readonly resendIntervalMs = 60 * 1000;

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private jwtService: JwtService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly authEmailService: AuthEmailService,
  ) {
    if (process.env.LOGIN_UNIVERSAL_CODE?.trim()) {
      if (this.isProduction) {
        this.logger.warn('LOGIN_UNIVERSAL_CODE is set in production and will be ignored.');
      } else {
        this.logger.warn('LOGIN_UNIVERSAL_CODE is active. Do NOT use in production.');
      }
    }
  }

  async register(dto: RegisterDto) {
    const existingUser = await this.usersRepository.findOne({
      where: { phone: dto.phone },
    });

    if (existingUser) {
      throw new UnauthorizedException('该手机号已注册');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    
    const user = this.usersRepository.create({
      ...dto,
      password: hashedPassword,
      healthTags: [],
    });

    await this.usersRepository.save(user);
    
    return this.generateToken(user);
  }

  async login(dto: LoginDto) {
    const account = dto.account.trim().toLowerCase();
    const user = account.includes('@')
      ? await this.usersRepository.findOne({
          where: { email: account },
        })
      : await this.usersRepository.findOne({
          where: { phone: dto.account.trim() },
        });

    if (!user) {
      throw new UnauthorizedException('邮箱/手机号或密码错误');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('邮箱/手机号或密码错误');
    }

    return this.generateToken(user);
  }

  async sendLoginCode(dto: SendLoginCodeDto) {
    const cacheKey = `login_code:${dto.phone}`;
    const cached = await this.cacheManager.get<{
      codeHash: string;
      sentAt: number;
    }>(cacheKey);
    if (cached && Date.now() - cached.sentAt < this.resendIntervalMs) {
      throw new HttpException('请求过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = this.generateCode();
    await this.cacheManager.set(
      cacheKey,
      {
        codeHash: this.hashVerificationCode(dto.phone, code),
        sentAt: Date.now(),
      },
      this.codeExpireMs,
    );

    // TODO: 接入短信平台发送验证码（阿里云/腾讯云等）
    this.logger.log(`login code generated for ${dto.phone}`);

    return {
      success: true,
      message: '验证码已发送',
      expireInSeconds: Math.floor(this.codeExpireMs / 1000),
      resendAfterSeconds: Math.floor(this.resendIntervalMs / 1000),
      universalCodeEnabled: !!this.universalCode,
    };
  }

  async sendEmailLoginCode(dto: SendEmailLoginCodeDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const cacheKey = `email_login_code:${normalizedEmail}`;
    const cached = await this.cacheManager.get<{
      codeHash: string;
      sentAt: number;
    }>(cacheKey);
    if (cached && Date.now() - cached.sentAt < this.resendIntervalMs) {
      throw new HttpException('请求过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = this.generateCode();
    await this.cacheManager.set(
      cacheKey,
      {
        codeHash: this.hashVerificationCode(normalizedEmail, code),
        sentAt: Date.now(),
      },
      this.codeExpireMs,
    );

    await this.authEmailService.sendLoginCodeEmail({
      email: normalizedEmail,
      code,
      expireMinutes: Math.floor(this.codeExpireMs / 60000),
    });

    return {
      success: true,
      message: '验证码已发送到邮箱',
      expireInSeconds: Math.floor(this.codeExpireMs / 1000),
      resendAfterSeconds: Math.floor(this.resendIntervalMs / 1000),
      universalCodeEnabled: !!this.universalCode,
    };
  }

  async loginWithCode(dto: CodeLoginDto) {
    await this.verifyAndConsumeCode(dto.phone, dto.code);

    const user = await this.findOrCreatePhoneUser(dto.phone);
    return this.generateToken(user);
  }

  async loginWithEmailCode(dto: EmailCodeLoginDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    await this.verifyAndConsumeEmailCode(normalizedEmail, dto.code);

    const user = await this.findOrCreateEmailUser(normalizedEmail);
    return this.generateToken(user);
  }

  async adminLogin(dto: AdminLoginDto) {
    const superAdminAccount = process.env.SUPER_ADMIN_ACCOUNT;
    const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD;
    if (!superAdminAccount || !superAdminPassword) {
      throw new UnauthorizedException('管理员登录未配置');
    }
    if (dto.account !== superAdminAccount || dto.password !== superAdminPassword) {
      throw new UnauthorizedException('超级管理员账号或密码错误');
    }

    return this.generateSuperAdminToken(superAdminAccount);
  }

  async validateUser(userId: string) {
    return this.usersRepository.findOne({ where: { id: userId } });
  }

  async verifyPhoneCode(phone: string, code: string) {
    await this.verifyAndConsumeCode(phone, code);
    return { success: true };
  }

  async verifyEmailCode(email: string, code: string) {
    await this.verifyAndConsumeEmailCode(email.trim().toLowerCase(), code);
    return { success: true };
  }

  async findOrCreateUserByPhone(phone: string) {
    return this.findOrCreatePhoneUser(phone);
  }

  async findOrCreateUserByEmail(email: string) {
    return this.findOrCreateEmailUser(email.trim().toLowerCase());
  }

  private generateCode(): string {
    if (this.universalCode) {
      return this.universalCode;
    }
    // 生成6位随机数字验证码
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async verifyAndConsumeCode(phone: string, code: string) {
    const inputCode = code.trim();
    const isUniversal = !!this.universalCode && inputCode === this.universalCode;

    if (!isUniversal) {
      const cacheKey = `login_code:${phone}`;
      const cached = await this.cacheManager.get<{
        codeHash: string;
        sentAt: number;
      }>(cacheKey);
      if (
        !cached ||
        !this.matchesVerificationCode({
          subject: phone,
          code: inputCode,
          expectedHash: cached.codeHash,
        })
      ) {
        throw new UnauthorizedException('验证码错误或已过期');
      }
      await this.cacheManager.del(cacheKey);
    }
  }

  private async verifyAndConsumeEmailCode(email: string, code: string) {
    const inputCode = code.trim();
    const isUniversal = !!this.universalCode && inputCode === this.universalCode;

    if (!isUniversal) {
      const cacheKey = `email_login_code:${email}`;
      const cached = await this.cacheManager.get<{
        codeHash: string;
        sentAt: number;
      }>(cacheKey);
      if (
        !cached ||
        !this.matchesVerificationCode({
          subject: email,
          code: inputCode,
          expectedHash: cached.codeHash,
        })
      ) {
        throw new UnauthorizedException('验证码错误或已过期');
      }
      await this.cacheManager.del(cacheKey);
    }
  }

  private async findOrCreatePhoneUser(phone: string): Promise<User> {
    const existing = await this.usersRepository.findOne({ where: { phone } });
    if (existing) {
      return existing;
    }

    const displayName = `用户${phone.slice(-4)}`;
    const placeholderPassword = await bcrypt.hash(
      `otp-${phone}-${Date.now()}`,
      10,
    );

    const user = this.usersRepository.create({
      phone,
      password: placeholderPassword,
      name: displayName,
      healthTags: [],
    });
    return this.usersRepository.save(user);
  }

  private async findOrCreateEmailUser(email: string): Promise<User> {
    const existing = await this.usersRepository.findOne({ where: { email } });
    if (existing) {
      return existing;
    }

    const emailPrefix = email.split('@')[0] || '用户';
    const displayName = emailPrefix.slice(0, 16);
    const syntheticPhone = `9${this.hashVerificationCode(email, 'email-user').slice(0, 10)}`;
    const placeholderPassword = await bcrypt.hash(
      `email-otp-${email}-${Date.now()}`,
      10,
    );

    const user = this.usersRepository.create({
      phone: syntheticPhone,
      email,
      password: placeholderPassword,
      name: displayName,
      healthTags: [],
    });

    try {
      return await this.usersRepository.save(user);
    } catch {
      const concurrent = await this.usersRepository.findOne({ where: { email } });
      if (concurrent) {
        return concurrent;
      }
      throw new UnauthorizedException('邮箱登录失败，请重试');
    }
  }

  private generateToken(user: User) {
    const payload = {
      sub: user.id,
      phone: user.phone,
      name: user.name,
      role: 'user',
    };
    
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        name: user.name,
        role: 'user',
        age: user.age,
        avatar: user.avatar,
        healthTags: user.healthTags,
        notifyAbnormal: user.notifyAbnormal,
        notifyMedication: user.notifyMedication,
        voiceReminder: user.voiceReminder,
      },
    };
  }

  private generateSuperAdminToken(account: string) {
    const payload = {
      sub: `super-admin-${account}`,
      phone: account,
      name: '超级管理员',
      role: 'super_admin',
      account,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: payload.sub,
        phone: payload.phone,
        name: payload.name,
        role: payload.role,
        account: payload.account,
      },
    };
  }

  private hashVerificationCode(subject: string, code: string) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }
    return createHmac('sha256', secret)
      .update(`${subject}:${code}`)
      .digest('hex');
  }

  private matchesVerificationCode(input: {
    subject: string;
    code: string;
    expectedHash: string;
  }) {
    const actualHash = this.hashVerificationCode(input.subject, input.code);
    const actual = Buffer.from(actualHash, 'utf8');
    const expected = Buffer.from(input.expectedHash, 'utf8');
    if (actual.length !== expected.length) {
      return false;
    }
    return timingSafeEqual(actual, expected);
  }
}
