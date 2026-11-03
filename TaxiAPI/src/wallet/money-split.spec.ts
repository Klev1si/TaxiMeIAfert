import { splitRide } from './money-split';

describe('ride money split', () => {
  it("owner's example: 100 € cash, driver 30 %, platform 5 % → 30 / 65 / 5", () => {
    expect(splitRide({ gross: 100, driverPct: 30, platformCommissionPct: 5, cardFeePct: null, cardCharged: 0 }))
      .toEqual({ driver: 30, company: 65, platformCommission: 5, cardFee: 0, platform: 5 });
  });

  it('card ride: the card fee also comes out of the company share, never the driver', () => {
    expect(splitRide({ gross: 100, driverPct: 30, platformCommissionPct: 5, cardFeePct: 10, cardCharged: 100 }))
      .toEqual({ driver: 30, company: 55, platformCommission: 5, cardFee: 10, platform: 15 });
  });

  it('subscription company (no commission), card ride: only the card fee', () => {
    expect(splitRide({ gross: 100, driverPct: 70, platformCommissionPct: null, cardFeePct: 10, cardCharged: 100 }))
      .toEqual({ driver: 70, company: 20, platformCommission: 0, cardFee: 10, platform: 10 });
  });

  it('solo driver on commission: platform takes its %, plus the card fee on card rides', () => {
    expect(splitRide({ gross: 100, driverPct: null, platformCommissionPct: 5, cardFeePct: null, cardCharged: 0 }).driver).toBe(95);
    expect(splitRide({ gross: 100, driverPct: null, platformCommissionPct: 5, cardFeePct: 10, cardCharged: 100 }).driver).toBe(85);
  });

  it('solo driver on subscription keeps everything on cash, pays only the card fee on card', () => {
    expect(splitRide({ gross: 40, driverPct: null, platformCommissionPct: null, cardFeePct: null, cardCharged: 0 }).driver).toBe(40);
    expect(splitRide({ gross: 40, driverPct: null, platformCommissionPct: null, cardFeePct: 12.5, cardCharged: 40 }).driver).toBe(35);
  });

  it('free first ride: card fee only on what was actually charged (0 €), commission on the full price', () => {
    expect(splitRide({ gross: 12.3, driverPct: null, platformCommissionPct: 5, cardFeePct: 10, cardCharged: 0 }))
      .toEqual({ driver: 11.68, company: 0, platformCommission: 0.62, cardFee: 0, platform: 0.62 });
  });
});
