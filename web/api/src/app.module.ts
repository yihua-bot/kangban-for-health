import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ReportsModule } from './modules/reports/reports.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { MedicationsModule } from './modules/medications/medications.module';
import { RechecksModule } from './modules/rechecks/rechecks.module';
import { FamilyModule } from './modules/family/family.module';
import { AdminModule } from './modules/admin/admin.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AppUpdatesModule } from './modules/app-updates/app-updates.module';

const isProduction = process.env.NODE_ENV === 'production';
const dbSynchronize =
  process.env.DB_SYNCHRONIZE === 'true' ? true : !isProduction;
const dbLogging = process.env.DB_LOGGING === 'true' ? true : !isProduction;
const dbSslEnabled =
  process.env.DB_SSL === 'true' ||
  /sslmode=(require|verify-ca|verify-full)/i.test(
    process.env.DATABASE_URL || '',
  );
const dbSslRejectUnauthorized =
  process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
const dbSslCa = process.env.DB_SSL_CA?.replace(/\\n/g, '\n');

@Module({
  imports: [
    // 配置模块
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // 限流模块
    ThrottlerModule.forRoot([{
      ttl: 60000, // 60 seconds
      limit: 100, // 100 requests per minute
    }]),
    // Redis 缓存（用于验证码存储）
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => {
        const redisOptions: Record<string, unknown> = {
          socket: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
          },
        };
        if (process.env.REDIS_PASSWORD) {
          redisOptions.password = process.env.REDIS_PASSWORD;
        }
        return {
          store: await redisStore(redisOptions),
        };
      },
    }),
    // 数据库连接 (PostgreSQL)
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || 'health_guardian',
      ssl:
        dbSslEnabled
          ? {
              rejectUnauthorized: dbSslRejectUnauthorized,
              ...(dbSslCa ? { ca: dbSslCa } : {}),
            }
          : false,
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: dbSynchronize,
      logging: dbLogging,
    }),
    // 业务模块
    AuthModule,
    UsersModule,
    ReportsModule,
    TasksModule,
    MetricsModule,
    MedicationsModule,
    RechecksModule,
    FamilyModule,
    AdminModule,
    NotificationsModule,
    AppUpdatesModule,
  ],
  providers: [
    // 全局启用限流守卫
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
