import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import * as path from 'path';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly baseUrl: string;
  private readonly enabled: boolean;

  constructor() {
    const endpoint = process.env.DO_SPACES_ENDPOINT;
    const key = process.env.DO_SPACES_KEY;
    const secret = process.env.DO_SPACES_SECRET;
    this.bucket = process.env.DO_SPACES_BUCKET || '';
    this.baseUrl = process.env.DO_SPACES_CDN_URL || endpoint || '';
    this.enabled = Boolean(endpoint && key && secret && this.bucket);

    if (this.enabled) {
      this.client = new S3Client({
        endpoint,
        region: process.env.DO_SPACES_REGION || '',
        credentials: { accessKeyId: key!, secretAccessKey: secret! },
        forcePathStyle: false,
      });
      this.logger.log(`Storage: S3-compatible storage enabled (bucket: ${this.bucket})`);
    } else {
      this.logger.warn('Storage: S3-compatible storage not configured, falling back to local disk');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async upload(
    buffer: Buffer,
    originalFilename: string,
    mimetype: string,
    folder = 'reports',
  ): Promise<string> {
    const ext = path.extname(originalFilename);
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 8);
    const key = `${folder}/${Date.now()}-${hash}${ext}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
        ACL: 'public-read',
      }),
    );

    return `${this.baseUrl}/${key}`;
  }

  async delete(url: string): Promise<void> {
    const key = this.urlToKey(url);
    if (!key) return;

    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err: any) {
      this.logger.warn(`Failed to delete file ${key}: ${err?.message}`);
    }
  }

  async download(url: string): Promise<Buffer> {
    const key = this.urlToKey(url);
    if (!key) {
      throw new Error(`Invalid storage url: ${url}`);
    }

    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    const body = response.Body;
    if (!body) {
      throw new Error(`Empty object body for key: ${key}`);
    }

    if (typeof (body as any).transformToByteArray === 'function') {
      const bytes = await (body as any).transformToByteArray();
      return Buffer.from(bytes);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
      if (typeof chunk === 'string') {
        chunks.push(Buffer.from(chunk));
      } else {
        chunks.push(Buffer.from(chunk));
      }
    }
    return Buffer.concat(chunks);
  }

  isExternalStorageUrl(url?: string): boolean {
    if (!url) {
      return false;
    }
    return this.urlToKey(url) !== null;
  }

  private urlToKey(url: string): string | null {
    try {
      const base = this.baseUrl.replace(/\/$/, '');
      if (url.startsWith(base)) {
        return url.slice(base.length + 1);
      }
      return null;
    } catch {
      return null;
    }
  }
}
