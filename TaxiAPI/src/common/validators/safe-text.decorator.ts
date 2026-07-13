import { applyDecorators } from '@nestjs/common';
import { Matches } from 'class-validator';

/**
 * Rejects the HTML-significant characters `<` and `>` in free-text fields
 * (names, vehicle details, addresses) that get echoed back to browsers —
 * notably the public trip-tracking page (legal/track.html).
 *
 * This is defence-in-depth: every render sink must still escape output. The
 * rule blocks tag injection at the boundary without rejecting legitimate
 * names/addresses, which may legitimately contain apostrophes, quotes,
 * accents, hyphens and spaces.
 *
 * Apply alongside the field's own @IsString()/@MaxLength() decorators.
 */
export function SafeText(): PropertyDecorator {
  return applyDecorators(
    Matches(/^[^<>]*$/, {
      message: 'must not contain the characters < or >',
    }),
  );
}
