import { Injectable, NotFoundException } from '@nestjs/common';
import { createReadStream, existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { Response } from 'express';

const DATA_DIR = join(process.cwd(), 'data', 'app-updates');
const BUNDLES_DIR = join(DATA_DIR, 'bundles');
const LATEST_JSON = join(DATA_DIR, 'latest.json');

export interface VersionInfo {
  version: string;
  downloadUrl: string;
  checksum: string;
  changelog: string;
  mandatory: boolean;
  updatedAt: string;
}

@Injectable()
export class AppUpdatesService {
  getLatest(): VersionInfo | null {
    if (!existsSync(LATEST_JSON)) {
      return null;
    }
    const raw = readFileSync(LATEST_JSON, 'utf8');
    return JSON.parse(raw) as VersionInfo;
  }

  serveBundle(filename: string, res: Response) {
    const filePath = resolve(BUNDLES_DIR, filename);

    if (!filePath.startsWith(`${resolve(BUNDLES_DIR)}/`) || !existsSync(filePath)) {
      throw new NotFoundException();
    }

    const stream = createReadStream(filePath);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    stream.pipe(res);
  }
}
