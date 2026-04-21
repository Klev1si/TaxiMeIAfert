import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterCompanyDto {
  /** E.164 phone — must be pre-verified via /auth/send-otp + /auth/verify-otp */
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'phone must be in E.164 format (e.g. +37491123456)',
  })
  phone: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(64)
  password: string;

  /** Legal / trading name of the taxi company */
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  companyName: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  address?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  city?: string;
}
