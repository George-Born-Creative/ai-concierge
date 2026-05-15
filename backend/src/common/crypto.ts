import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// AES-256-GCM helpers used to encrypt CRM tokens and OpenAI API keys.
// Format on disk: base64(iv) + ':' + base64(ciphertext) + ':' + base64(tag).

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;

function loadKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('ENCRYPTION_KEY is not set');
  }
  const buf = /^[0-9a-fA-F]+$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error('ENCRYPTION_KEY must decode to 32 bytes');
  }
  return buf;
}

export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${encrypted.toString('base64')}:${tag.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  const key = loadKey();
  const [ivPart, dataPart, tagPart] = payload.split(':');
  if (!ivPart || !dataPart || !tagPart) {
    throw new Error('Invalid encrypted payload');
  }
  const iv = Buffer.from(ivPart, 'base64');
  const data = Buffer.from(dataPart, 'base64');
  const tag = Buffer.from(tagPart, 'base64');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}
