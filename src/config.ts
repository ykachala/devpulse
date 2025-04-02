/**
 * Configuration module — validates all required environment variables at startup.
 * Throws immediately if a required variable is missing, preventing silent misconfiguration.
 */

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export interface Config {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  github: { clientId: string; clientSecret: string; callbackUrl: string };
  jwt: { secret: string; expiresIn: string };
  tokenEncryptionKey: string; // 32-byte hex (64 chars)
  anthropic: { apiKey: string };
  aws: { accessKeyId: string; secretAccessKey: string; s3Bucket: string; region: string };
}

export function loadConfig(): Config {
  return {
    port: parseInt(process.env['PORT'] ?? '3000', 10),
    databaseUrl: required('DATABASE_URL'),
    redisUrl: required('REDIS_URL'),
    github: {
      clientId: required('GITHUB_CLIENT_ID'),
      clientSecret: required('GITHUB_CLIENT_SECRET'),
      callbackUrl: process.env['GITHUB_CALLBACK_URL'] ?? 'http://localhost:3000/api/v1/auth/callback',
    },
    jwt: {
      secret: required('JWT_SECRET'),
      expiresIn: process.env['JWT_EXPIRES_IN'] ?? '7d',
    },
    tokenEncryptionKey: required('TOKEN_ENCRYPTION_KEY'),
    anthropic: { apiKey: required('ANTHROPIC_API_KEY') },
    aws: {
      accessKeyId: required('AWS_ACCESS_KEY_ID'),
      secretAccessKey: required('AWS_SECRET_ACCESS_KEY'),
      s3Bucket: required('AWS_S3_BUCKET'),
      region: process.env['AWS_REGION'] ?? 'eu-west-1',
    },
  };
}
