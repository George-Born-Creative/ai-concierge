import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SupportRequestCategory } from '@prisma/client';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateSupportRequestDto {
  @IsString()
  @MinLength(16)
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9._:-]+$/, {
    message: 'clientRequestId contains unsupported characters',
  })
  clientRequestId!: string;

  @IsEnum(SupportRequestCategory)
  category!: SupportRequestCategory;

  @Transform(trimString)
  @IsString()
  @MinLength(5)
  @MaxLength(120)
  @Matches(/^[^\r\n]+$/, { message: 'subject must be a single line' })
  subject!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(20)
  @MaxLength(5000)
  description!: string;
}
