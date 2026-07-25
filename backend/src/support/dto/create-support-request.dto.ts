import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SupportRequestCategory } from '@prisma/client';

import {
  CLIENT_DIAGNOSTIC_PLATFORMS,
  CLIENT_PUSH_STATUSES,
  type ClientSupportDiagnostics,
} from '../support-diagnostics.policy';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ClientSupportDiagnosticsDto
  implements ClientSupportDiagnostics
{
  @IsISO8601({ strict: true })
  @MaxLength(40)
  capturedAt!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  appVersion!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  buildVersion!: string | null;

  @IsIn(CLIENT_DIAGNOSTIC_PLATFORMS)
  platform!: ClientSupportDiagnostics['platform'];

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  osVersion!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  executionEnvironment!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  timezone!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(35)
  locale!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  networkType!: string;

  @IsOptional()
  @IsBoolean()
  networkReachable!: boolean | null;

  @IsIn(CLIENT_PUSH_STATUSES)
  pushStatus!: ClientSupportDiagnostics['pushStatus'];

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/^[A-Za-z0-9.\-:[\]]+$/, {
    message: 'apiHost must contain only a hostname and optional port',
  })
  apiHost!: string;

  @IsBoolean()
  apiReachable!: boolean;
}

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

  @IsOptional()
  @IsBoolean()
  includeDiagnostics?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ClientSupportDiagnosticsDto)
  clientDiagnostics?: ClientSupportDiagnosticsDto;
}
