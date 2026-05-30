import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterClientDto {
  /** E.164 phone — must be pre-verified via /auth/send-otp + /auth/verify-otp */
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'phone must be in E.164 format (e.g. +37491123456)',
  })
  phone: string;

  /** Email — required so the user can reset their password via email. */
  @IsEmail({}, { message: 'email must be a valid address' })
  @MaxLength(255)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(64)
  password: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName: string;
}
