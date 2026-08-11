import {
  Allow,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GhlContactCustomFieldDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  key?: string;

  @Allow()
  field_value!: string | number | boolean | string[] | null;
}
export class CreateGhlContactDto {
  @IsOptional() @IsString() @MinLength(1) firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsString() address1?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() postalCode?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() assignedTo?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GhlContactCustomFieldDto)
  customFields?: GhlContactCustomFieldDto[];
}
