import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { SafeText } from '../../common/validators/safe-text.decorator.js';

/**
 * Apple Sign-In payload. Apple only returns the user's name on the FIRST
 * authorization, so the client forwards `firstName`/`lastName` for account
 * creation; both are absent on subsequent sign-ins.
 *
 * The names are stored on the new account and later rendered in browser
 * contexts (e.g. the public trip-tracking page), so they carry the same
 * @SafeText guard as the registration DTOs.
 */
export class AppleSignInDto {
  @IsString()
  @IsNotEmpty()
  identityToken: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  @SafeText()
  firstName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  @SafeText()
  lastName?: string;
}
