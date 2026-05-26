import { IsString, MinLength } from 'class-validator';

export class InterpretCommandDto {
  @IsString()
  @MinLength(1)
  text!: string;
}
