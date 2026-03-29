import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { getComplianceDefaults } from '../../common/compliance-defaults';

@Injectable()
export class UsersService {
  private readonly complianceDefaults = getComplianceDefaults();

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private readonly notificationsService: NotificationsService,
    private readonly dataSource: DataSource,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { phone } });
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    
    Object.assign(user, dto);
    return this.usersRepository.save(user);
  }

  async getProfile(id: string) {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    
    const { password, ...result } = user;
    return result;
  }

  async setPassword(id: string, password: string) {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    user.password = await bcrypt.hash(password, 10);
    await this.usersRepository.save(user);

    return { success: true };
  }

  async registerPushToken(id: string, dto: RegisterPushTokenDto) {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return this.notificationsService.registerPushToken(id, dto);
  }

  async removePushToken(id: string, token: string) {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return this.notificationsService.removePushToken(id, token);
  }

  async getComplianceDocs() {
    await this.ensureComplianceTable();
    const rows = await this.dataSource.query(
      'SELECT key, value, updated_at FROM app_settings WHERE key IN ($1, $2, $3, $4)',
      [
        'compliance_privacy',
        'compliance_terms',
        'compliance_medical',
        'compliance_data_deletion',
      ],
    );

    const rowMap = new Map<string, { value: string; updated_at: string }>();
    for (const row of rows) {
      rowMap.set(row.key, row);
    }

    return {
      privacy:
        rowMap.get('compliance_privacy')?.value || this.complianceDefaults.privacy,
      terms: rowMap.get('compliance_terms')?.value || this.complianceDefaults.terms,
      medical:
        rowMap.get('compliance_medical')?.value || this.complianceDefaults.medical,
      dataDeletion:
        rowMap.get('compliance_data_deletion')?.value
        || this.complianceDefaults.dataDeletion,
      updatedAt:
        rowMap.get('compliance_privacy')?.updated_at ||
        rowMap.get('compliance_terms')?.updated_at ||
        rowMap.get('compliance_medical')?.updated_at ||
        rowMap.get('compliance_data_deletion')?.updated_at ||
        new Date().toISOString(),
    };
  }

  async deleteAccount(id: string) {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `
          DELETE FROM sync_records
          WHERE elder_user_id = $1
        `,
        [id],
      );
      await manager.query(
        `
          DELETE FROM sync_records
          WHERE family_member_id IN (
            SELECT id FROM family_members
            WHERE user_id = $1 OR elder_user_id = $1
          )
        `,
        [id],
      );
      await manager.query(
        `
          DELETE FROM family_members
          WHERE user_id = $1 OR elder_user_id = $1
        `,
        [id],
      );
      await manager.query('DELETE FROM health_tasks WHERE user_id = $1', [id]);
      await manager.query('DELETE FROM rechecks WHERE user_id = $1', [id]);
      await manager.query('DELETE FROM health_metrics WHERE user_id = $1', [id]);
      await manager.query('DELETE FROM medications WHERE user_id = $1', [id]);
      await manager.query(
        `
          DELETE FROM report_abnormalities
          WHERE report_id IN (
            SELECT id FROM health_reports WHERE user_id = $1
          )
        `,
        [id],
      );
      await manager.query('DELETE FROM health_reports WHERE user_id = $1', [id]);
      await manager.query('DELETE FROM push_delivery_logs WHERE user_id = $1', [id]);
      await manager.query('DELETE FROM push_device_tokens WHERE user_id = $1', [id]);
      await manager.query('DELETE FROM users WHERE id = $1', [id]);
    });

    return {
      success: true,
      deletedUserId: id,
      deletedAt: new Date().toISOString(),
    };
  }

  private async ensureComplianceTable() {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key varchar(128) PRIMARY KEY,
        value text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT NOW()
      )
    `);
  }
}
