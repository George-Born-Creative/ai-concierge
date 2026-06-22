import { IsString, MinLength } from 'class-validator';

// App Store Server Notifications V2 send a single field, `signedPayload`,
// which is itself a JWS. Apple's docs:
// https://developer.apple.com/documentation/appstoreservernotifications/responsebodyv2
export class AppleNotificationDto {
  @IsString()
  @MinLength(20)
  signedPayload!: string;
}
