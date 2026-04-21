import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class SendOtpDto {
  /** E.164 format, e.g. +37491123456 */
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'phone must be in E.164 format (e.g. +37491123456)',
  })
  phone: string;
}
