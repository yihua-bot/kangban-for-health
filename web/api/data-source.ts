import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbSslEnabled =
  process.env.DB_SSL === 'true' ||
  /sslmode=(require|verify-ca|verify-full)/i.test(process.env.DATABASE_URL || '');

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'health_guardian',
  ssl: dbSslEnabled
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : false,
  entities: [path.join(__dirname, 'src/**/*.entity{.ts,.js}')],
  migrations: [path.join(__dirname, 'src/migrations/*{.ts,.js}')],
  migrationsTableName: 'typeorm_migrations',
});
