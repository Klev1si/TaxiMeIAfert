/**
 * How one ride's money is split between the driver, their company and the
 * platform. Single source of truth for the wallet and the finance screens.
 *
 *   gross   = the full price of the ride (passenger paid + any discount the
 *             platform funded, e.g. the first-ride offer)
 *   charged = what was actually charged to a card (card rides only)
 *
 * Platform:  commission% × gross (commission contracts)
 *          + cardFee%   × charged (card rides, every contract)
 *
 * Company drivers: the driver ALWAYS gets driverPct% of gross — platform
 *   fees come out of the company's share:
 *     company = gross − driver − platform
 *   e.g. 100 € cash, driver 30 %, platform 5 % → driver 30, platform 5, company 65.
 *
 * Solo drivers (driverPct = null): driver = gross − platform.
 */
export interface RideSplitInput {
  gross:                 number;
  /** Driver's % of the fare under a company; null for solo drivers. */
  driverPct:             number | null;
  /** Platform commission % (commission contracts), else null/0. */
  platformCommissionPct: number | null;
  /** Card fee %; null/0 for cash rides. */
  cardFeePct:            number | null;
  /** Amount charged to the card (card rides). */
  cardCharged:           number;
}

export interface RideSplit {
  driver:             number;
  company:            number;
  platformCommission: number;
  cardFee:            number;
  platform:           number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function splitRide(i: RideSplitInput): RideSplit {
  const gross              = Math.max(0, i.gross);
  const platformCommission = r2(gross * (i.platformCommissionPct ?? 0) / 100);
  const cardFee            = r2(Math.max(0, i.cardCharged) * (i.cardFeePct ?? 0) / 100);
  const platform           = r2(platformCommission + cardFee);
  if (i.driverPct == null) {
    return { driver: r2(gross - platform), company: 0, platformCommission, cardFee, platform };
  }
  const driver = r2(gross * i.driverPct / 100);
  return { driver, company: r2(gross - driver - platform), platformCommission, cardFee, platform };
}

export function driverShareOfRide(i: RideSplitInput): number {
  return splitRide(i).driver;
}
