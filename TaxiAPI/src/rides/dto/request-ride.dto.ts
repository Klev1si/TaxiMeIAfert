import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VehicleType } from '../../common/enums/index.js';

export class RideStopDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  lng: number;

  @IsOptional()
  @IsString()
  address?: string;
}

export class RequestRideDto {
  /** Pickup latitude */
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  pickupLat: number;

  /** Pickup longitude */
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  pickupLng: number;

  @IsOptional()
  @IsString()
  pickupAddress?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  dropoffLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  dropoffLng?: number;

  @IsOptional()
  @IsString()
  dropoffAddress?: string;

  /** Search radius in km (default 5, max 50) */
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(50)
  @Type(() => Number)
  radiusKm?: number;

  /**
   * ISO-8601 timestamp for a scheduled ride (must be at least 10 minutes in the future).
   * Omit or set to null for an immediate ride.
   */
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  /** Optional promo / discount code to apply to this ride. */
  @IsOptional()
  @IsString()
  promoCode?: string;

  /**
   * Preferred vehicle type (economy / comfort / XL).
   * Omit to accept any available driver regardless of vehicle class.
   */
  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;

  /**
   * Optional list of intermediate stops between pickup and dropoff.
   * Ordered by the client; up to 5 stops allowed.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RideStopDto)
  stops?: RideStopDto[];
}
