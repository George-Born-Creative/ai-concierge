import { IsIn } from 'class-validator';

export class UpdateActiveProviderDto {
  @IsIn(['ghl', 'hubspot'], { message: 'provider must be ghl or hubspot' })
  provider!: 'ghl' | 'hubspot';
}
