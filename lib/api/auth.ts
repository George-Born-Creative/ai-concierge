import { apiRequest } from './client';
import type { AuthResponse, SignInRequest, SignUpRequest } from './types';

export async function signUp(data: SignUpRequest): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/signup', {
    method: 'POST',
    body: data,
  });
}

export async function signIn(data: SignInRequest): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/signin', {
    method: 'POST',
    body: data,
  });
}

export async function signOut(token: string): Promise<void> {
  return apiRequest<void>('/auth/signout', {
    method: 'POST',
    token,
  });
}

export async function getMe(token: string) {
  return apiRequest('/auth/me', { token });
}
