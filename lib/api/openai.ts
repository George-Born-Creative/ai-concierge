import { apiRequest } from './client';
import type { OpenAIKeyStatus, SaveOpenAIKeyRequest } from './types';

// Sends the plaintext key to the backend, which encrypts and stores it.
// The response never includes the full key — only the last 4 chars for a
// masked preview.
export async function saveKey(data: SaveOpenAIKeyRequest): Promise<OpenAIKeyStatus> {
  return apiRequest<OpenAIKeyStatus>('/openai/keys', {
    method: 'POST',
    body: data,
  });
}

export async function getStatus(): Promise<OpenAIKeyStatus> {
  return apiRequest<OpenAIKeyStatus>('/openai/keys');
}

export async function deleteKey(): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>('/openai/keys', { method: 'DELETE' });
}
