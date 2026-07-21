import { apiRequest } from './client';
import type {
  CreateSupportRequest,
  CreateSupportRequestResponse,
} from './types';

export async function createRequest(
  data: CreateSupportRequest,
): Promise<CreateSupportRequestResponse> {
  return apiRequest<CreateSupportRequestResponse>('/support/requests', {
    method: 'POST',
    body: data,
  });
}
