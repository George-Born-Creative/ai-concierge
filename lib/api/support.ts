import { apiRequest } from './client';
import type {
  CreateSupportRequest,
  CreateSupportRequestResponse,
  SupportDiagnosticsResponse,
} from './types';

export async function getDiagnostics(): Promise<SupportDiagnosticsResponse> {
  return apiRequest<SupportDiagnosticsResponse>('/support/diagnostics');
}

export async function createRequest(
  data: CreateSupportRequest,
): Promise<CreateSupportRequestResponse> {
  return apiRequest<CreateSupportRequestResponse>('/support/requests', {
    method: 'POST',
    body: data,
  });
}
