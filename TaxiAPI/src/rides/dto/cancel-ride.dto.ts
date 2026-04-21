import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelRideDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
