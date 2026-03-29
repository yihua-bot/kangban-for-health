import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthEmailService } from './auth-email.service';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { User } from '../users/entities/user.entity';
import { DemoUserSeedService } from './demo-user-seed.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET environment variable is required but not set');
        }
        return { secret, signOptions: { expiresIn: '7d' } };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthEmailService, AuthService, JwtStrategy, DemoUserSeedService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
