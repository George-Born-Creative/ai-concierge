import { IsOptional, IsString, MaxLength } from 'class-validator';

export class HubspotDealReadQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idProperty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  properties?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  propertiesWithHistory?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  associations?: string;
}
