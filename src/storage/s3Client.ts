/**
 * AWS S3 storage client.
 * Handles object uploads and presigned URL generation for profile exports.
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
}

export class S3Storage {
  private s3: S3Client;
  private bucket: string;

  constructor(config: S3Config) {
    this.s3 = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    this.bucket = config.bucket;
  }

  /**
   * Uploads a string body to S3 at the given key.
   * @param key - S3 object key (path within bucket)
   * @param body - String content to upload
   * @param contentType - MIME type of the content
   */
  async upload(key: string, body: string, contentType: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    });
    await this.s3.send(command);
  }

  /**
   * Generates a presigned GET URL for downloading an S3 object.
   * @param key - S3 object key to generate URL for
   * @param expiresIn - URL validity in seconds (default: 3600)
   */
  async getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.s3, command, { expiresIn });
  }
}
