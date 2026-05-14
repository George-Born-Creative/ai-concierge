import { apiRequest } from './client';
import type {
  OpenAIKeyStatus,
  SaveOpenAIKeyRequest,
  SaveOpenAIKeyResponse,
} from './types';

// The mobile app never keeps the OpenAI key locally. After saving the
// backend stores it encrypted and only returns the last 4 characters
// for the masked UI display. Use rotateOpenAIKey to replace it.

export async function saveOpenAIKey(
  data: SaveOpenAIKeyRequest,
  token: string
): Promise<SaveOpenAIKeyResponse> {
  return apiRequest<SaveOpenAIKeyResponse>('/openai/keys', {
    method: 'POST',
    body: data,
    token,
  });
}

export async function rotateOpenAIKey(
  data: SaveOpenAIKeyRequest,
  token: string
): Promise<SaveOpenAIKeyResponse> {
  return apiRequest<SaveOpenAIKeyResponse>('/openai/keys', {
    method: 'PUT',
    body: data,
    token,
  });
}

export async function getOpenAIKeyStatus(token: string): Promise<OpenAIKeyStatus> {
  return apiRequest<OpenAIKeyStatus>('/openai/keys/status', { token });
}

export async function deleteOpenAIKey(token: string): Promise<void> {
  return apiRequest<void>('/openai/keys', { method: 'DELETE', token });
}
