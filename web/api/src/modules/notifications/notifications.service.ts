import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { connect } from 'node:http2';
import { SignJWT, importPKCS8 } from 'jose';
import { FamilyMember } from '../family/entities/family-member.entity';

interface RegisterPushTokenInput {
  token: string;
  platform?: string;
  appBundleId?: string;
  environment?: string;
  deviceName?: string;
}

interface PushDeviceTokenRow {
  token: string;
  userId: string;
  platform: string;
  appBundleId: string | null;
  apnsEnvironment: string;
  deviceName: string | null;
}

interface PushTemplate {
  title: string;
  body: string;
  templateKey: string;
  entityType: string;
  entityId: string;
  dedupeKey: string;
  data?: Record<string, string | number | boolean | null | undefined>;
}

interface SendAttemptResult {
  statusCode: number;
  responseBody: string;
}

interface RecheckReminderCandidate {
  id: string;
  userId: string;
  itemName: string;
  checkType: string;
  dueDate: string;
  reminderDays: number;
  status: string;
  hospital: string | null;
  appointmentDate: string | null;
  userName: string;
}

type ApnsPrivateKey = Awaited<ReturnType<typeof importPKCS8>>;

const APNS_INVALID_REASONS = new Set([
  'BadDeviceToken',
  'DeviceTokenNotForTopic',
  'Unregistered',
]);

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private reminderTimer: NodeJS.Timeout | null = null;
  private reminderJobRunning = false;
  private apnsJwt: string | null = null;
  private apnsJwtExpiresAt = 0;
  private apnsPrivateKeyPromise: Promise<ApnsPrivateKey> | null = null;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(FamilyMember)
    private readonly familyMemberRepository: Repository<FamilyMember>,
  ) {}

  async onModuleInit() {
    await this.ensurePushTables();
    this.startReminderLoop();
  }

  onModuleDestroy() {
    if (this.reminderTimer) {
      clearInterval(this.reminderTimer);
      this.reminderTimer = null;
    }
  }

  async registerPushToken(userId: string, input: RegisterPushTokenInput) {
    const token = input.token.trim();
    if (!token) {
      return { success: false, message: 'push token 不能为空' };
    }

    const platform = (input.platform || 'ios').trim().toLowerCase();
    const appBundleId = input.appBundleId?.trim() || this.getApnsTopic();
    const environment = this.normalizeEnvironment(input.environment);
    const deviceName = input.deviceName?.trim() || null;

    await this.dataSource.query(
      `
        INSERT INTO push_device_tokens (
          token,
          user_id,
          platform,
          app_bundle_id,
          apns_environment,
          device_name,
          is_active,
          last_registered_at,
          last_seen_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW(), NOW(), NOW())
        ON CONFLICT (token)
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          platform = EXCLUDED.platform,
          app_bundle_id = EXCLUDED.app_bundle_id,
          apns_environment = EXCLUDED.apns_environment,
          device_name = EXCLUDED.device_name,
          is_active = TRUE,
          last_registered_at = NOW(),
          last_seen_at = NOW(),
          updated_at = NOW()
      `,
      [token, userId, platform, appBundleId, environment, deviceName],
    );

    return {
      success: true,
      token,
      platform,
      environment,
    };
  }

  async removePushToken(userId: string, token: string) {
    const trimmed = token.trim();
    if (!trimmed) {
      return { success: false, message: 'push token 不能为空' };
    }

    await this.dataSource.query(
      `
        UPDATE push_device_tokens
        SET is_active = FALSE, updated_at = NOW()
        WHERE token = $1 AND user_id = $2
      `,
      [trimmed, userId],
    );

    return { success: true };
  }

  async sendReportProcessedNotification(params: {
    userId: string;
    reportId: string;
    abnormalityCount: number;
    success: boolean;
  }) {
    const title = params.success ? '报告解析完成' : '报告解析待重试';
    const body = params.success
      ? params.abnormalityCount > 0
        ? `本次报告识别到 ${params.abnormalityCount} 项异常，已同步生成任务与复查安排。`
        : '本次报告已完成解析，当前未识别到明确异常项。'
      : '报告已上传，但解析服务暂时不可用，稍后会自动重试。';

    await this.sendTemplateToUsers([params.userId], {
      title,
      body,
      templateKey: 'report_processed',
      entityType: 'report',
      entityId: params.reportId,
      dedupeKey: `report-processed:${params.reportId}:${params.success ? 'success' : 'pending'}`,
      data: {
        reportId: params.reportId,
        abnormalityCount: params.abnormalityCount,
        success: params.success,
      },
    });
  }

  async sendFamilyFollowUpToMembers(params: {
    elderUserId: string;
    syncType: string;
    entityId: string;
    description: string;
  }) {
    const members = await this.familyMemberRepository.find({
      where: params.syncType === 'metric'
        ? {
            elderUserId: params.elderUserId,
            notificationEnabled: true,
            canViewMetrics: true,
          }
        : {
            elderUserId: params.elderUserId,
            notificationEnabled: true,
            canViewReports: true,
          },
    });

    const userIds = members.map((member) => member.userId);
    if (userIds.length === 0) {
      return 0;
    }

    await this.sendTemplateToUsers(userIds, {
      title: '家属协同更新',
      body: params.description,
      templateKey: 'family_follow_up',
      entityType: params.syncType,
      entityId: params.entityId,
      dedupeKey: `family-member:${params.syncType}:${params.entityId}`,
      data: {
        elderUserId: params.elderUserId,
        syncType: params.syncType,
        entityId: params.entityId,
      },
    });

    return userIds.length;
  }

  async sendFamilyFollowUpToElder(params: {
    elderUserId: string;
    syncType: string;
    entityId: string;
    description: string;
  }) {
    await this.sendTemplateToUsers([params.elderUserId], {
      title: '家属已跟进',
      body: params.description,
      templateKey: 'family_follow_up',
      entityType: params.syncType,
      entityId: params.entityId,
      dedupeKey: `family-elder:${params.syncType}:${params.entityId}:${this.slugify(params.description)}`,
      data: {
        elderUserId: params.elderUserId,
        syncType: params.syncType,
        entityId: params.entityId,
      },
    });
  }

  async processRecheckReminders() {
    if (this.reminderJobRunning) {
      return;
    }

    this.reminderJobRunning = true;
    try {
      const candidates = await this.dataSource.query<RecheckReminderCandidate[]>(
        `
          SELECT
            r.id,
            r.user_id AS "userId",
            r.item_name AS "itemName",
            r.check_type AS "checkType",
            r.due_date::text AS "dueDate",
            r.reminder_days AS "reminderDays",
            r.status,
            r.hospital,
            r.appointment_date::text AS "appointmentDate",
            u.name AS "userName"
          FROM rechecks r
          INNER JOIN users u ON u.id = r.user_id
          WHERE r.reminder_enabled = TRUE
            AND r.status IN ('pending', 'scheduled')
            AND r.due_date <= CURRENT_DATE + r.reminder_days
          ORDER BY r.due_date ASC
          LIMIT 100
        `,
      );

      for (const recheck of candidates) {
        await this.sendRecheckReminderNotifications(recheck);
      }
    } catch (error: any) {
      this.logger.error(`recheck reminder loop failed: ${error?.message || 'unknown error'}`);
    } finally {
      this.reminderJobRunning = false;
    }
  }

  private async sendRecheckReminderNotifications(recheck: RecheckReminderCandidate) {
    const dueDate = new Date(`${recheck.dueDate}T00:00:00+08:00`);
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const daysLeft = this.diffDays(today, dueDate);
    const userBody = this.buildRecheckReminderBody(recheck, daysLeft, false);
    const familyBody = this.buildRecheckReminderBody(recheck, daysLeft, true);

    await this.sendTemplateToUsers([recheck.userId], {
      title: daysLeft < 0 ? '复查已逾期' : daysLeft === 0 ? '今天需要复查' : '复查提醒',
      body: userBody,
      templateKey: 'recheck_reminder',
      entityType: 'recheck',
      entityId: recheck.id,
      dedupeKey: `recheck-user:${recheck.id}:${todayKey}`,
      data: {
        recheckId: recheck.id,
        dueDate: recheck.dueDate,
        status: recheck.status,
      },
    });

    const familyMembers = await this.familyMemberRepository.find({
      where: {
        elderUserId: recheck.userId,
        notificationEnabled: true,
        canViewReports: true,
      },
    });

    const familyIds = familyMembers.map((item) => item.userId);
    if (familyIds.length === 0) {
      return;
    }

    await this.sendTemplateToUsers(familyIds, {
      title: '家属复查提醒',
      body: familyBody,
      templateKey: 'recheck_reminder',
      entityType: 'recheck',
      entityId: recheck.id,
      dedupeKey: `recheck-family:${recheck.id}:${todayKey}`,
      data: {
        recheckId: recheck.id,
        elderUserId: recheck.userId,
        dueDate: recheck.dueDate,
      },
    });
  }

  private buildRecheckReminderBody(
    recheck: RecheckReminderCandidate,
    daysLeft: number,
    includeUserName: boolean,
  ) {
    const subject = includeUserName
      ? `${recheck.userName} 的${recheck.checkType}`
      : `${recheck.checkType}`;

    if (recheck.status === 'scheduled' && recheck.appointmentDate) {
      return `${subject} 已预约在 ${recheck.appointmentDate}，请按时到院复查。`;
    }

    if (daysLeft < 0) {
      return `${subject} 已超过计划时间 ${Math.abs(daysLeft)} 天，建议尽快处理。`;
    }

    if (daysLeft === 0) {
      return `${subject} 安排在今天完成，建议优先处理。`;
    }

    return `${subject} 需在 ${recheck.dueDate} 前完成，目前还剩 ${daysLeft} 天。`;
  }

  private async sendTemplateToUsers(userIds: string[], template: PushTemplate) {
    const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
    if (uniqueIds.length === 0) {
      return;
    }

    const devices = await this.getActiveDevicesForUsers(uniqueIds);
    if (devices.length === 0) {
      return;
    }

    for (const device of devices) {
      const alreadySent = await this.deliveryExists(template.dedupeKey, device.token);
      if (alreadySent) {
        continue;
      }

      const result = await this.sendToDevice(device, template);
      await this.recordDelivery({
        userId: device.userId,
        token: device.token,
        templateKey: template.templateKey,
        entityType: template.entityType,
        entityId: template.entityId,
        dedupeKey: template.dedupeKey,
        status: result.statusCode >= 200 && result.statusCode < 300 ? 'sent' : 'failed',
        responseStatus: result.statusCode,
        responseBody: result.responseBody,
      });
    }
  }

  private async getActiveDevicesForUsers(userIds: string[]): Promise<PushDeviceTokenRow[]> {
    if (userIds.length === 0) {
      return [];
    }

    return this.dataSource.query<PushDeviceTokenRow[]>(
      `
        SELECT
          token,
          user_id AS "userId",
          platform,
          app_bundle_id AS "appBundleId",
          apns_environment AS "apnsEnvironment",
          device_name AS "deviceName"
        FROM push_device_tokens
        WHERE user_id = ANY($1)
          AND is_active = TRUE
          AND platform = 'ios'
      `,
      [userIds],
    );
  }

  private async sendToDevice(device: PushDeviceTokenRow, template: PushTemplate): Promise<SendAttemptResult> {
    const config = await this.getApnsConfig();
    if (!config) {
      return {
        statusCode: 503,
        responseBody: 'APNs not configured',
      };
    }

    const jwt = await this.getApnsJwt(config.teamId, config.keyId, config.privateKey);
    const host = device.apnsEnvironment === 'sandbox'
      ? 'https://api.sandbox.push.apple.com'
      : 'https://api.push.apple.com';

    const payload = JSON.stringify({
      aps: {
        alert: {
          title: template.title,
          body: template.body,
        },
        sound: 'default',
      },
      type: template.templateKey,
      entityType: template.entityType,
      entityId: template.entityId,
      ...template.data,
    });

    try {
      const result = await this.sendApnsRequest({
        host,
        token: device.token,
        jwt,
        topic: device.appBundleId || config.topic,
        payload,
      });

      const reason = this.extractApnsReason(result.responseBody);
      if (result.statusCode >= 400 && reason && APNS_INVALID_REASONS.has(reason)) {
        await this.deactivateToken(device.token);
      }

      return result;
    } catch (error: any) {
      this.logger.error(`APNs send failed for ${device.userId}: ${error?.message || 'unknown error'}`);
      return {
        statusCode: 500,
        responseBody: error?.message || 'APNs send failed',
      };
    }
  }

  private async sendApnsRequest(params: {
    host: string;
    token: string;
    jwt: string;
    topic: string;
    payload: string;
  }): Promise<SendAttemptResult> {
    return new Promise((resolve, reject) => {
      const client = connect(params.host);
      let statusCode = 0;
      let responseBody = '';
      let resolved = false;

      const closeClient = () => {
        if (!client.closed && !client.destroyed) {
          client.close();
        }
      };

      client.on('error', (error) => {
        closeClient();
        if (!resolved) {
          resolved = true;
          reject(error);
        }
      });

      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${params.token}`,
        authorization: `bearer ${params.jwt}`,
        'apns-topic': params.topic,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      });

      req.setEncoding('utf8');
      req.on('response', (headers) => {
        statusCode = Number(headers[':status'] || 0);
      });
      req.on('data', (chunk) => {
        responseBody += chunk;
      });
      req.on('end', () => {
        closeClient();
        if (!resolved) {
          resolved = true;
          resolve({ statusCode, responseBody });
        }
      });
      req.on('error', (error) => {
        closeClient();
        if (!resolved) {
          resolved = true;
          reject(error);
        }
      });
      req.write(params.payload);
      req.end();
    });
  }

  private async getApnsConfig() {
    const teamId = process.env.APNS_TEAM_ID?.trim();
    const keyId = process.env.APNS_KEY_ID?.trim();
    const topic = this.getApnsTopic();
    const privateKey = this.getApnsPrivateKey();

    if (!teamId || !keyId || !topic || !privateKey) {
      return null;
    }

    return { teamId, keyId, topic, privateKey };
  }

  private getApnsTopic() {
    const topic = process.env.APNS_BUNDLE_ID?.trim() || process.env.APP_BUNDLE_ID?.trim();
    if (!topic) {
      this.logger.warn('APNS_BUNDLE_ID / APP_BUNDLE_ID is not configured; APNs push notifications will not be sent.');
    }
    return topic || '';
  }

  private getApnsPrivateKey() {
    const inlineKey = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, '\n')?.trim();
    if (inlineKey) {
      return inlineKey;
    }

    const base64Key = process.env.APNS_PRIVATE_KEY_BASE64?.trim();
    if (!base64Key) {
      return null;
    }

    return Buffer.from(base64Key, 'base64').toString('utf8').trim();
  }

  private async getApnsJwt(teamId: string, keyId: string, privateKey: string) {
    if (this.apnsJwt && Date.now() < this.apnsJwtExpiresAt) {
      return this.apnsJwt;
    }

    if (!this.apnsPrivateKeyPromise) {
      this.apnsPrivateKeyPromise = importPKCS8(privateKey, 'ES256');
    }

    const key = await this.apnsPrivateKeyPromise;
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: keyId })
      .setIssuer(teamId)
      .setIssuedAt()
      .sign(key);

    this.apnsJwt = token;
    this.apnsJwtExpiresAt = Date.now() + 45 * 60 * 1000;
    return token;
  }

  private async deliveryExists(dedupeKey: string, token: string) {
    const rows = await this.dataSource.query<{ exists: boolean }[]>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM push_delivery_logs
          WHERE dedupe_key = $1
            AND token = $2
            AND status = 'sent'
        ) AS exists
      `,
      [dedupeKey, token],
    );

    return Boolean(rows[0]?.exists);
  }

  private async recordDelivery(params: {
    userId: string;
    token: string;
    templateKey: string;
    entityType: string;
    entityId: string;
    dedupeKey: string;
    status: string;
    responseStatus: number;
    responseBody: string;
  }) {
    await this.dataSource.query(
      `
        INSERT INTO push_delivery_logs (
          user_id,
          token,
          template_key,
          entity_type,
          entity_id,
          dedupe_key,
          status,
          response_status,
          response_body
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (dedupe_key, token)
        DO UPDATE SET
          status = EXCLUDED.status,
          response_status = EXCLUDED.response_status,
          response_body = EXCLUDED.response_body,
          sent_at = NOW()
      `,
      [
        params.userId,
        params.token,
        params.templateKey,
        params.entityType,
        params.entityId,
        params.dedupeKey,
        params.status,
        params.responseStatus,
        params.responseBody,
      ],
    );
  }

  private async deactivateToken(token: string) {
    await this.dataSource.query(
      `
        UPDATE push_device_tokens
        SET is_active = FALSE, updated_at = NOW()
        WHERE token = $1
      `,
      [token],
    );
  }

  private async ensurePushTables() {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS push_device_tokens (
        token TEXT PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        platform VARCHAR(20) NOT NULL DEFAULT 'ios',
        app_bundle_id VARCHAR(160),
        apns_environment VARCHAR(20) NOT NULL DEFAULT 'production',
        device_name VARCHAR(120),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        last_registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_push_device_tokens_user_id
      ON push_device_tokens (user_id)
    `);
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS push_delivery_logs (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL,
        template_key VARCHAR(80) NOT NULL,
        entity_type VARCHAR(40),
        entity_id TEXT,
        dedupe_key VARCHAR(200) NOT NULL,
        status VARCHAR(20) NOT NULL,
        response_status INTEGER,
        response_body TEXT,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.dataSource.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_push_delivery_logs_dedupe_token
      ON push_delivery_logs (dedupe_key, token)
    `);
  }

  private startReminderLoop() {
    if (process.env.PUSH_RECHECK_REMINDER_ENABLED === 'false') {
      return;
    }

    const intervalMs = Number(process.env.PUSH_RECHECK_REMINDER_POLL_MS || 300000);
    setTimeout(() => {
      void this.processRecheckReminders();
    }, 15000);
    this.reminderTimer = setInterval(() => {
      void this.processRecheckReminders();
    }, Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 300000);
  }

  private normalizeEnvironment(environment?: string) {
    if ((environment || '').trim().toLowerCase() === 'sandbox') {
      return 'sandbox';
    }
    return 'production';
  }

  private slugify(input: string) {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  private diffDays(left: Date, right: Date) {
    const start = new Date(left);
    start.setHours(0, 0, 0, 0);
    const end = new Date(right);
    end.setHours(0, 0, 0, 0);
    return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  }

  private extractApnsReason(responseBody: string) {
    if (!responseBody) {
      return null;
    }

    try {
      const parsed = JSON.parse(responseBody);
      return typeof parsed?.reason === 'string' ? parsed.reason : null;
    } catch {
      return null;
    }
  }
}
