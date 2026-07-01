import { apiRequest } from './client';
import type {
  AuthResponse,
  GoogleAuthRequest,
  SignInRequest,
  SignUpRequest,
  User,
} from './types';

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

// Exchanges a Google ID token for an app session. No app token is needed yet.
export async function googleSignIn(
  data: GoogleAuthRequest,
): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/google', {
    method: 'POST',
    body: data,
    token: null,
  });
}

// Confirms the emailed 6-digit code. Requires the JWT issued at signup, so the
// default (session) token is used. Returns the updated profile.
export async function verifyEmail(code: string): Promise<User> {
  return apiRequest<User>('/auth/verify-email', {
    method: 'POST',
    body: { code },
  });
}

// Re-sends the verification code to the signed-in (but unverified) user.
export async function resendCode(): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>('/auth/resend-code', { method: 'POST' });
}

export async function signOut(): Promise<void> {
  return apiRequest<void>('/auth/signout', { method: 'POST' });
}

export async function getMe(): Promise<User> {
  return apiRequest<User>('/auth/me');
}

export type UpdateProfileRequest = {
  name?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
};

export async function updateMe(data: UpdateProfileRequest): Promise<User> {
  return apiRequest<User>('/auth/me', {
    method: 'PATCH',
    body: data,
  });
}
