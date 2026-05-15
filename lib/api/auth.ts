import { apiRequest } from './client';
import type { AuthResponse, SignInRequest, SignUpRequest, User } from './types';

export async function signUp(data: SignUpRequest): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/signup', {
    method: 'POST',
    body: data,
    token: null,
  });
}

export async function signIn(data: SignInRequest): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/signin', {
    method: 'POST',
    body: data,
    token: null,
  });
}

export async function signOut(): Promise<void> {
  return apiRequest<void>('/auth/signout', { method: 'POST' });
}

export async function getMe(): Promise<User> {
  return apiRequest<User>('/auth/me');
}
