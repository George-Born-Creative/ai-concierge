import { IsString, MinLength } from 'class-validator';

export class SaveOpenAIKeyDto {
  // OpenAI keys are typically 51+ chars (sk-..., sk-proj-..., etc.). We don't
  // tightly validate format here; the upstream call will fail fast if it's
  // bogus.
  @IsString()
  @MinLength(20)
  key!: string;
}
