import { IsString, MinLength } from 'class-validator';

// Same shape as verify — Restore Purchases posts the most recent JWS the
// device has on file. We keep a separate DTO so the controller signatures
// stay clear about which mobile flow is calling.
export class RestoreAppleReceiptDto {
  @IsString()
  planCode!: string;

  @IsString()
  @MinLength(20)
  jwsRepresentation!: string;
}
