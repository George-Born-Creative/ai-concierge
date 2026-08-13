import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleSignInDto {
  // The Google ID token (JWT) returned by the native Google Sign-In flow on the
  // mobile app. The backend verifies its signature and audience before trusting
  // any identity claims inside it.
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}
