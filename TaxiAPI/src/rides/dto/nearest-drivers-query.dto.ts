import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class NearestDriversQueryDto {
  /** Client latitude — E.g. 40.1872 */
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  /** Client longitude — E.g. 44.5152 */
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  /** Search radius in kilometres (default 5, max 50) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(50)
  radius?: number = 5;

  /** Maximum results to return (default 10, max 50) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}
