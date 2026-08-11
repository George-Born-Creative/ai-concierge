import { Type } from 'class-transformer';
import { IsArray, IsEmail, IsOptional, IsString, ValidateNested } from 'class-validator';

import { GhlContactCustomFieldDto } from './create-contact.dto';

export class UpdateGhlContactDto {
  @IsOptional() @IsString() firstName?: string | null;
  @IsOptional() @IsString() lastName?: string | null;
  @IsOptional() @IsString() name?: string | null;
  @IsOptional() @IsEmail() email?: string | null;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() companyName?: string | null;
  @IsOptional() @IsString() address1?: string | null;
  @IsOptional() @IsString() city?: string | null;
  @IsOptional() @IsString() state?: string | null;
  @IsOptional() @IsString() postalCode?: string | null;
  @IsOptional() @IsString() country?: string | null;
  @IsOptional() @IsString() website?: string | null;
  @IsOptional() @IsString() timezone?: string | null;
  @IsOptional() @IsString() source?: string | null;
  @IsOptional() @IsString() assignedTo?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GhlContactCustomFieldDto)
  customFields?: GhlContactCustomFieldDto[];
}
