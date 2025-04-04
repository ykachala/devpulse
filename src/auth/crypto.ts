/**
 * AES-256-GCM token encryption.
 * GitHub OAuth access tokens are encrypted at rest using this utility
 * before being stored in the database.
 */
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

export interface EncryptedData {
  encrypted: string;
  iv: string;
  tag: string;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * @param plaintext - The raw token or secret to encrypt
 * @param keyHex - 32-byte key as a 64-character hex string
 */
export function encryptToken(plaintext: string, keyHex: string): EncryptedData {
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

/**
 * Decrypts an AES-256-GCM encrypted token.
 * @param encrypted - Hex-encoded ciphertext
 * @param iv - Hex-encoded initialisation vector
 * @param tag - Hex-encoded authentication tag
 * @param keyHex - 32-byte key as a 64-character hex string
 */
export function decryptToken(encrypted: string, iv: string, tag: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}
