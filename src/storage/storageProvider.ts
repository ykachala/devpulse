import fs from 'fs';
import path from 'path';

export interface StorageProvider {
  upload(key: string, body: string, contentType: string): Promise<void>;
  getPresignedUrl(key: string, expiresIn?: number): Promise<string>;
}

export class LocalStorage implements StorageProvider {
  constructor(
    private readonly basePath: string,
    private readonly baseUrl: string
  ) {}

  async upload(key: string, body: string): Promise<void> {
    const filePath = path.join(this.basePath, key);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, body, 'utf-8');
  }

  // Returns a direct local URL — no expiry on local files
  async getPresignedUrl(key: string): Promise<string> {
    return `${this.baseUrl}/${key}`;
  }
}

export interface StorageFactoryConfig {
  driver: 'local' | 's3';
  localBasePath: string;
  localBaseUrl: string;
  aws: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    bucket: string;
  };
}

export function createStorageProvider(cfg: StorageFactoryConfig): StorageProvider {
  if (cfg.driver === 'local') {
    return new LocalStorage(cfg.localBasePath, cfg.localBaseUrl);
  }

  // Dynamic require avoids a circular import — s3Client imports StorageProvider from this file
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { S3Storage } = require('./s3Client') as { S3Storage: new (c: typeof cfg.aws & { bucket: string }) => StorageProvider };
  return new S3Storage(cfg.aws);
}
