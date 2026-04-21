import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

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
}
