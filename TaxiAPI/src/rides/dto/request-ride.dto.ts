import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VehicleType } from '../../common/enums/index.js';
import { SafeText } from '../../common/validators/safe-text.decorator.js';

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
  @MaxLength(300)
  @SafeText()
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
  @MaxLength(300)
  @SafeText()
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
  @MaxLength(300)
  @SafeText()
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

  /**
   * Optional — request the ride directly to a specific driver (must be a
   * favorited driver of the client). If the driver is offline or doesn't
   * respond within the usual offer window, the request fails so the client
   * can re-try a normal dispatch.
   */
  @IsOptional()
  @IsUUID()
  preferredDriverId?: string;
}
