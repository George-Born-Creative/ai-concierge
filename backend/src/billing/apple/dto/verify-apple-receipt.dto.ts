import { IsString, MinLength } from 'class-validator';

export class VerifyAppleReceiptDto {
  @IsString()
  planCode!: string;

  // StoreKit 2 JWS — three base64url segments separated by dots. We don't
  // try to parse it here (SignedDataVerifier owns that), but we sanity-check
  // it's non-empty so we don't burn an Apple round-trip on `""`.
  @IsString()
  @MinLength(20)
  jwsRepresentation!: string;
}
