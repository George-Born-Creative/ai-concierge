import { IsIn, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class RunAssistantCommandDto {
  @IsString()
  @MinLength(1)
  text!: string;

  @IsOptional()
  @IsIn(['text', 'voice'])
  source?: 'text' | 'voice';

  @IsOptional()
  @IsString()
  transcript?: string;

  @IsOptional()
  @IsString()
  voiceUri?: string;

  @IsOptional()
  @IsObject()
  intent?: {
    intent: string;
    confidence: number;
    entities: Record<string, string | number | boolean | null>;
    needs_clarification: boolean;
    notes: string | null;
  };
}
