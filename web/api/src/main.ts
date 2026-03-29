import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import * as cookieParser from 'cookie-parser';
import * as Sentry from '@sentry/nestjs';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

// Sentry 必须在应用创建前初始化
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
  });
}

async function bootstrap() {
  const winstonLogger = WinstonModule.createLogger({
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, context }) =>
            `${timestamp} [${context ?? 'App'}] ${level}: ${message}`,
          ),
        ),
      }),
    ],
  });

  const app = await NestFactory.create(AppModule, { logger: winstonLogger });
  const logger = new Logger('Bootstrap');
  const isProduction = process.env.NODE_ENV === 'production';

  // Cookie 解析
  app.use(cookieParser());

  // 全局异常过滤器
  app.useGlobalFilters(new AllExceptionsFilter());

  // 全局验证管道
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
  }));

  // CORS配置：生产环境必须配置 CORS_ORIGINS，开发环境默认允许 localhost
  const corsOriginsEnv = process.env.CORS_ORIGINS?.trim();
  const isDev = !isProduction;
  const localhostOrigins = [
    'https://localhost',
    'https://127.0.0.1',
    'http://localhost',
    'http://127.0.0.1',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:4173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:4173',
  ];
  const nativeAppOrigins = [
    'capacitor://localhost',
    'ionic://localhost',
  ];

  // 只有开发环境且未配置 CORS_ORIGINS 时才允许所有来源
  const allowAllOrigins = isDev && (!corsOriginsEnv || corsOriginsEnv === '*');

  const configuredOrigins = corsOriginsEnv && corsOriginsEnv !== '*'
    ? corsOriginsEnv.split(',').map((o) => o.trim()).filter(Boolean)
    : [];

  const defaultOrigins = [...localhostOrigins, ...nativeAppOrigins];
  const allowedOrigins = configuredOrigins.length > 0
    ? Array.from(new Set([...configuredOrigins, ...defaultOrigins]))
    : defaultOrigins;

  if (isProduction && (!corsOriginsEnv || corsOriginsEnv === '*')) {
    logger.warn('CORS_ORIGINS is not configured for production; only localhost origins are allowed.');
  }

  app.enableCors({
    origin: allowAllOrigins ? true : allowedOrigins,
    credentials: true,
  });

  // 健康检查接口（用于负载均衡和容器探针）
  const server = app.getHttpAdapter().getInstance();
  server.get('/health', (_req: any, res: any) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  // Swagger API文档（仅非生产环境启用）
  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('康伴 API')
      .setDescription('康伴健康管理平台 API 文档')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 3001;
  await app.listen(port);
  logger.log(`API服务已启动: http://localhost:${port}`);
  logger.log(`API文档: http://localhost:${port}/api/docs`);
}
bootstrap();
