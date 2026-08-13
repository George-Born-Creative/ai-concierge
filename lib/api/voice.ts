import { getToken } from '../session';

import { getApiBaseUrl } from './base-url';
import { ApiError } from './api-error';
import { toNetworkApiError } from './network-error';
import { apiRequest } from './client';
import type { TranscribeResponse, VoiceIntent } from './types';
// We bypass apiRequest here because that helper sends JSON — Whisper needs
// multipart/form-data with the raw file. React Native's FormData accepts the
// shorthand { uri, name, type } shape for file fields.
export async function transcribe(
  fileUri: string,
  // When provided, the backend streams partial transcript deltas over the
  // socket keyed by this id (Sprint 5). Omit it for the legacy blocking path.
  requestId?: string,
): Promise<TranscribeResponse> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new ApiError(0, 'API URL is not set.');
  }

  const token = getToken();
  if (!token) {
    throw new ApiError(401, 'Not signed in');
  }

  const form = new FormData();
  // The mime type matters: Whisper sniffs by both filename and content type.
  form.append('file', {
    uri: fileUri,
    name: extractFilename(fileUri),
    type: guessMimeType(fileUri),
  } as unknown as Blob);
  if (requestId) {
    form.append('requestId', requestId);
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/voice/transcribe`, {
      method: 'POST',
      headers: {
        // Do NOT set Content-Type; the runtime will add it with the correct
        // multipart boundary.
        Authorization: `Bearer ${token}`,
      },
      body: form,
    });
  } catch (err) {
    throw toNetworkApiError(err, baseUrl);
  }

  if (!response.ok) {
    const message = await safeErrorMessage(response);
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as TranscribeResponse;
}

export async function interpret(text: string): Promise<VoiceIntent> {
  return apiRequest<VoiceIntent>('/voice/interpret', {
    method: 'POST',
    body: { text },
  });
}

function extractFilename(uri: string): string {
  const slash = uri.lastIndexOf('/');
  const name = slash >= 0 ? uri.slice(slash + 1) : uri;
  return name || 'voice.m4a';
}

function guessMimeType(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.m4a') || lower.endsWith('.mp4')) return 'audio/m4a';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.webm')) return 'audio/webm';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  return 'audio/m4a';
}

async function safeErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return `Transcription failed (status ${response.status})`;
  try {
    const body = JSON.parse(text);
    if (Array.isArray(body?.message)) return body.message.join(', ');
    if (typeof body?.message === 'string') return body.message;
  } catch {
    // not JSON
  }
  return text;
}
