import { IsString, IsNotEmpty, MinLength, IsOptional } from 'class-validator';

/**
 * Login accepts either:
 *   - `phone` (phone-based login, the original flow), or
 *   - `identifier` containing a phone OR email address (new tab-switcher flow).
 *
 * At least one of `phone` or `identifier` must be present.
 */
export class LoginDto {
  @IsString() @IsOptional()
  phone?: string;

  /** Email or phone — used by the redesigned login screen's Phone/Email tabs. */
  @IsString() @IsOptional()
  identifier?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}
