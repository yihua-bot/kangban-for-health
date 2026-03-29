import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/entities/user.entity';

@Injectable()
export class DemoUserSeedService implements OnModuleInit {
  private readonly logger = new Logger(DemoUserSeedService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async onModuleInit() {
    const shouldSeed = process.env.SEED_DEMO_USER === 'true';
    if (!shouldSeed) {
      return;
    }

    const phone = process.env.DEMO_USER_PHONE || '13800138000';
    const email = process.env.DEMO_USER_EMAIL || 'demo@example.com';
    const password = process.env.DEMO_USER_PASSWORD;
    const name = process.env.DEMO_USER_NAME || '演示用户';

    if (!password) {
      this.logger.warn('DEMO_USER_PASSWORD not set, skipping demo user seed');
      return;
    }

    try {
      const existingUser = await this.usersRepository.findOne({
        where: [{ phone }, { email }],
      });
      if (existingUser) {
        return;
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = this.usersRepository.create({
        phone,
        email,
        password: hashedPassword,
        name,
        healthTags: [],
      });

      await this.usersRepository.save(user);
      this.logger.log(`Demo user seeded: ${email}/${phone}`);
    } catch (error: any) {
      this.logger.warn(
        `Failed to seed demo user: ${error?.message || 'unknown error'}`,
      );
    }
  }
}
