import { IsString } from 'class-validator';

export class CreatePaymentSheetDto {
  @IsString()
  planCode!: string;
}
