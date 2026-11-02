process.env.PROMO_FINGERPRINT_SECRET = 'test-fingerprint-secret';

import { FirstRideOfferService, normaliseEmail, normalisePhone } from './first-ride-offer.service';

/** In-memory stand-ins for the four repositories the service uses. */
function makeService(settings: Record<string, unknown> | null = null) {
  const stored = new Set<string>();
  let setting = settings;
  const fpRepo = {
    createQueryBuilder: () => {
      const qb: any = {
        _fps: [] as string[],
        where: (_: string, p: { fps: string[] }) => { qb._fps = p.fps; return qb; },
        getCount: async () => qb._fps.filter((f: string) => stored.has(f)).length,
        insert: () => qb,
        into: () => qb,
        values: (rows: Array<{ fingerprint: string }>) => { qb._rows = rows; return qb; },
        orIgnore: () => qb,
        execute: async () => { qb._rows.forEach((r: { fingerprint: string }) => stored.add(r.fingerprint)); },
      };
      return qb;
    },
  };
  const settingsRepo = {
    findOne: async () => (setting ? { key: 'first_ride_offer', value: setting } : null),
    save: async (row: { value: Record<string, unknown> }) => { setting = row.value; },
  };
  const svc = new FirstRideOfferService(settingsRepo as any, fpRepo as any, {} as any, {} as any);
  return { svc, stored };
}

const alice = { phone: '+383 44 123 456', email: 'Alice.Smith+taxi@Gmail.com', googleSub: 'g-1', appleSub: null };

describe('FirstRideOfferService', () => {
  it('normalises phone numbers and emails so trivial variations match', () => {
    expect(normalisePhone('+383 44-123-456')).toBe('+38344123456');
    expect(normalisePhone('0038344123456')).toBe('+38344123456');
    expect(normaliseEmail('Alice.Smith+taxi@Gmail.com')).toBe('alicesmith@gmail.com');
    expect(normaliseEmail('a.b+x@googlemail.com')).toBe('ab@gmail.com');
    expect(normaliseEmail('John.Doe+1@outlook.com')).toBe('john.doe@outlook.com');
  });

  it('stores only hashes, never the raw phone or email', () => {
    const { svc } = makeService();
    const fps = svc.fingerprints(alice);
    expect(fps.map((f) => f.kind)).toEqual(['phone', 'email', 'google']);
    for (const f of fps) {
      expect(f.fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(f.fingerprint).not.toContain('383');
    }
  });

  it('a new passenger is eligible; after using the offer, a re-registration is not', async () => {
    const { svc } = makeService();
    expect(await svc.isEligible(alice, 0)).toBe(true);
    await svc.recordUsage(alice);

    // Deleted the account and registered again with the same phone only.
    expect(await svc.isEligible({ phone: '+38344123456', email: null, googleSub: null, appleSub: null }, 0)).toBe(false);
    // ...or with the same Gmail written differently.
    expect(await svc.isEligible({ phone: '+38349999999', email: 'alicesmith@gmail.com', googleSub: null, appleSub: null }, 0)).toBe(false);
    // ...or with the same Google account.
    expect(await svc.isEligible({ phone: null, email: null, googleSub: 'g-1', appleSub: null }, 0)).toBe(false);
    // A genuinely different person is still eligible.
    expect(await svc.isEligible({ phone: '+38349999999', email: 'bob@example.com', googleSub: null, appleSub: null }, 0)).toBe(true);
  });

  it('is never eligible after a completed ride or when the offer is off', async () => {
    expect(await makeService().svc.isEligible(alice, 1)).toBe(false);
    expect(await makeService({ enabled: false }).svc.isEligible(alice, 0)).toBe(false);
  });

  it('ignores the placeholder phone of a deleted account', () => {
    const { svc } = makeService();
    expect(svc.fingerprints({ phone: 'del_abc123', email: null, googleSub: null, appleSub: null })).toEqual([]);
  });

  it('keeps admin settings within safe bounds', async () => {
    const { svc } = makeService();
    expect(await svc.getOffer()).toEqual({ enabled: true, discountPct: 100, maxKm: 10 });
    expect(await svc.updateOffer({ discountPct: 50, maxKm: 8 })).toEqual({ enabled: true, discountPct: 50, maxKm: 8 });
    expect((await svc.updateOffer({ discountPct: 250 })).discountPct).toBe(100);
    expect((await svc.updateOffer({ discountPct: 0 })).discountPct).toBe(1);
  });
});
