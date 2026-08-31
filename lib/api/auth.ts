import { apiRequest } from './client';
import type {
  AuthResponse,
  CodeDeliveryResponse,
  CrmProvider,
  GoogleAuthRequest,
  RequestPasswordResetRequest,
  ResetPasswordRequest,
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
export async function resendCode(): Promise<CodeDeliveryResponse> {
  return apiRequest<CodeDeliveryResponse>('/auth/resend-code', {
    method: 'POST',
  });
}

// Forgot-password step 1. Unauthenticated (token: null). The current backend
// returns 404 for unknown accounts and 400 for Google-only accounts.
export async function requestPasswordReset(
  data: RequestPasswordResetRequest,
): Promise<CodeDeliveryResponse> {
  return apiRequest<CodeDeliveryResponse>('/auth/request-password-reset', {
    method: 'POST',
    body: data,
    token: null,
  });
}

// Forgot-password step 2. Unauthenticated (token: null). Verifies the emailed
// code and sets the new password.
export async function resetPassword(
  data: ResetPasswordRequest,
): Promise<CodeDeliveryResponse> {
  return apiRequest<CodeDeliveryResponse>('/auth/reset-password', {
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

export async function setActiveProvider(provider: CrmProvider): Promise<User> {
  return apiRequest<User>('/auth/me/active-provider', {
    method: 'PATCH',
    body: { provider },
  });
}
