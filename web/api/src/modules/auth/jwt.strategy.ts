import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required but not set');
    }
    super({
      jwtFromRequest: (req: Request) => {
        const cookieToken = req?.cookies?.access_token;
        if (cookieToken) return cookieToken;
        return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
      },
      ignoreExpiration: false,
      secretOrKey: secret,
      passReqToCallback: false,
    });
  }

  async validate(payload: { sub: string; role?: string; account?: string; phone?: string; name?: string }) {
    const superAdminAccount = process.env.SUPER_ADMIN_ACCOUNT;
    if (payload.role === 'super_admin' && superAdminAccount && payload.account === superAdminAccount) {
      return {
        id: payload.sub,
        phone: payload.phone,
        name: payload.name || '超级管理员',
        role: 'super_admin',
        account: payload.account,
      };
    }

    const user = await this.authService.validateUser(payload.sub);
    if (!user) {
      throw new UnauthorizedException('无效的登录状态');
    }
    return user;
  }
}

