import {
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

export class RegisterDriverDto {
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

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  licenseNumber: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  vehicleMake: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  vehicleModel: string;

  @Type(() => Number)
  @IsInt()
  @Min(1990)
  @Max(new Date().getFullYear() + 1)
  vehicleYear: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  vehiclePlate: string;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  vehicleColor?: string;

  /** Vehicle category — economy, comfort, XL */
  @IsEnum(VehicleType)
  @IsOptional()
  vehicleType?: VehicleType;
}
