import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthEmailService {
  private readonly logger = new Logger(AuthEmailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendLoginCodeEmail(input: {
    email: string;
    code: string;
    expireMinutes: number;
  }) {
    const provider = (
      this.configService.get<string>('EMAIL_OTP_PROVIDER') || 'log'
    ).toLowerCase();

    if (provider === 'log') {
      this.logger.log(
        `email login code generated for ${input.email}: ${input.code}`,
      );
      return;
    }

    if (provider !== 'resend') {
      throw new ServiceUnavailableException('未配置可用的邮件服务');
    }

    const apiKey =
      this.configService.get<string>('EMAIL_OTP_API_KEY') ||
      this.configService.get<string>('RESEND_API_KEY');
    const from =
      this.configService.get<string>('EMAIL_OTP_FROM') ||
      this.configService.get<string>('RESEND_FROM_EMAIL') ||
      this.configService.get<string>('EMAIL_FROM');
    const replyTo =
      this.configService.get<string>('EMAIL_OTP_REPLY_TO') ||
      this.configService.get<string>('EMAIL_REPLY_TO');
    const brandName =
      this.configService.get<string>('EMAIL_OTP_BRAND_NAME') || '康伴';

    if (!apiKey || !from) {
      throw new ServiceUnavailableException('邮件服务密钥或发件人未配置');
    }

    const subject = `${brandName} 登录验证码`;
    const html = buildLoginCodeHtml({
      brandName,
      code: input.code,
      expireMinutes: input.expireMinutes,
    });

    const resendEndpoint =
      this.configService.get<string>('RESEND_API_ENDPOINT') ||
      'https://api.resend.com/emails';

    const response = await fetch(resendEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.email],
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      this.logger.error(
        `failed to send login email: status=${response.status}, detail=${detail}`,
      );
      if (response.status >= 400 && response.status < 500) {
        throw new ServiceUnavailableException('邮件发送服务暂不可用');
      }
      throw new InternalServerErrorException('邮件发送失败');
    }
  }
}

function buildLoginCodeHtml(input: {
  brandName: string;
  code: string;
  expireMinutes: number;
}) {
  return `
  <div style="margin:0;padding:32px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:24px;padding:32px;border:1px solid #e2e8f0;box-shadow:0 12px 40px rgba(15,23,42,0.08);">
      <div style="font-size:12px;font-weight:800;letter-spacing:0.18em;color:#0284c7;">${escapeHtml(input.brandName)}</div>
      <h1 style="margin:12px 0 8px;font-size:28px;line-height:1.2;">登录验证码</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#475569;">
        你正在登录 ${escapeHtml(input.brandName)}。请输入下面的验证码完成登录。
      </p>
      <div style="margin:0 0 24px;padding:20px;border-radius:18px;background:linear-gradient(135deg,#eff6ff 0%,#ecfeff 100%);border:1px solid #bae6fd;text-align:center;">
        <div style="font-size:36px;font-weight:900;letter-spacing:0.28em;color:#0f172a;">${escapeHtml(input.code)}</div>
      </div>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#475569;">
        验证码将在 <strong>${input.expireMinutes} 分钟</strong> 后失效。请勿将验证码透露给任何人。
      </p>
      <p style="margin:0;font-size:13px;line-height:1.7;color:#94a3b8;">
        如果这不是你的操作，可以直接忽略这封邮件。
      </p>
    </div>
  </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
