import { PrismaClient } from '@prisma/client';
import OpenAI, { APIError } from 'openai';
import { createDecipheriv } from 'node:crypto';

const userId = process.argv[2] ?? 'cmpele82c0000iv3dd0tpq2kc';

function decryptSecret(payload) {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) throw new Error('ENCRYPTION_KEY missing');
  const key = Buffer.from(keyHex, 'hex');
  const [ivPart, dataPart, tagPart] = payload.split(':');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

const prisma = new PrismaClient();
const row = await prisma.openAIKey.findUnique({ where: { userId } });
if (!row) {
  console.log('No key for user', userId);
  process.exit(1);
}

console.log('Stored last4:', row.last4);
console.log('Updated at:', row.updatedAt.toISOString());

const apiKey = decryptSecret(row.encryptedKey);
console.log('Decrypted prefix:', apiKey.slice(0, 7) + '...' + apiKey.slice(-4));

const openai = new OpenAI({ apiKey });
try {
  await openai.models.list();
  console.log('models.list: OK');
} catch (err) {
  console.log('models.list:', err instanceof APIError ? `HTTP ${err.status} ${err.message}` : String(err));
}

try {
  // Minimal whisper test would need audio file — skip; chat is cheaper check
  await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 1,
  });
  console.log('chat completion: OK');
} catch (err) {
  console.log(
    'chat completion:',
    err instanceof APIError ? `HTTP ${err.status} ${err.message}` : String(err),
  );
}

await prisma.$disconnect();
