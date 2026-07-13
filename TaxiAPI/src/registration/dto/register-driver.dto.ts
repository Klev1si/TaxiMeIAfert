import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VehicleType } from '../../common/enums/index.js';
import { SafeText } from '../../common/validators/safe-text.decorator.js';

export class RegisterDriverDto {
  /** E.164 phone — must be pre-verified via /auth/send-otp + /auth/verify-otp */
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'phone must be in E.164 format (e.g. +37491123456)',
  })
  phone: string;

  /** Email — required for password reset and important notifications. */
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
  @SafeText()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @SafeText()
  lastName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @SafeText()
  licenseNumber: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @SafeText()
  vehicleMake: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @SafeText()
  vehicleModel: string;

  @Type(() => Number)
  @IsInt()
  @Min(1990)
  @Max(new Date().getFullYear() + 1)
  vehicleYear: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @SafeText()
  vehiclePlate: string;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  @SafeText()
  vehicleColor?: string;

  /** Vehicle category — economy, comfort, XL */
  @IsEnum(VehicleType)
  @IsOptional()
  vehicleType?: VehicleType;
}
