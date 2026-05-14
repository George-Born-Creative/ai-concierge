import { apiRequest } from './client';
import type { SaveOpenAIKeyRequest, SaveOpenAIKeyResponse } from './types';

/**
 * Sends the OpenAI API key to your backend to be validated and stored
 * server-side. The key is never kept in the app after this call.
 */
export async function saveOpenAIKey(
  data: SaveOpenAIKeyRequest,
  token: string
): Promise<SaveOpenAIKeyResponse> {
  return apiRequest<SaveOpenAIKeyResponse>('/openai/key', {
    method: 'POST',
    body: data,
    token,
  });
}

export async function deleteOpenAIKey(token: string): Promise<void> {
  return apiRequest<void>('/openai/key', { method: 'DELETE', token });
}
