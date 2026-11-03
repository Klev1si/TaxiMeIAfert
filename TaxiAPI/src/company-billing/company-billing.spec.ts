import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { SubscriptionStatus } from '../common/enums';
import { periodStart, validateContract } from './company-billing.service';

/** SubscriptionsService with in-memory repos: one company driver. */
function service(
  company: Record<string, unknown> | null,
  companySub: Record<string, unknown> | null = null,
  soloDriver: Record<string, unknown> = {},
) {
  const repo = (value: unknown) => {
    const qb: any = { leftJoinAndSelect: () => qb, where: () => qb, orderBy: () => qb, getOne: async () => value };
    return { findOne: async () => value, createQueryBuilder: () => qb };
  };
  const driver = { id: 'd1', companyId: company ? 'c1' : null, userId: 'u-driver', ...soloDriver };
  return new SubscriptionsService(
    repo(null) as any,                           // plans
    repo(companySub) as any,                     // company subscriptions
    repo(null) as any,                           // driver subscriptions
    repo(company ? { id: 'c1', userId: 'u-company', ...company } : null) as any,
    repo(driver) as any,                         // drivers
    repo(null) as any,                           // users
    {} as any, {} as any,
  );
}

const future = new Date(Date.now() + 10 * 86_400_000);

describe('company contracts', () => {
  it('validates the contract an admin chooses', () => {
    expect(validateContract('commission', 5)).toEqual({ billingModel: 'commission', platformCommissionPct: 5 });
    expect(validateContract('commission', 3.456)).toEqual({ billingModel: 'commission', platformCommissionPct: 3.46 });
    expect(validateContract('subscription', 5)).toEqual({ billingModel: 'subscription', platformCommissionPct: null });
    expect(() => validateContract('commission', 0)).toThrow(BadRequestException);
    expect(() => validateContract('commission', 75)).toThrow(BadRequestException);
    expect(() => validateContract('commission', null)).toThrow(BadRequestException);
  });

  it('computes period starts', () => {
    const now = new Date(2026, 10, 18, 15, 30); // Wed 18 Nov 2026
    expect(periodStart('month', now)).toEqual(new Date(2026, 10, 1));
    expect(periodStart('today', now)).toEqual(new Date(2026, 10, 18));
    expect(periodStart('all', now)).toBeNull();
  });

  it('commission-contract drivers can work without any subscription', async () => {
    const svc = service({ billingModel: 'commission', platformCommissionPct: 5 });
    await expect(svc.assertDriverCanWork('d1')).resolves.toBeUndefined();
    expect((await svc.getDriverWorkingState('d1')).contract).toBe('commission');
  });

  it('drivers of a company without a contract cannot take rides', async () => {
    const svc = service({ billingModel: 'unassigned' });
    await expect(svc.assertDriverCanWork('d1')).rejects.toThrow(/contract with the platform is not set up/);
  });

  it('subscription-contract companies still depend on their plan', async () => {
    const paid = service({ billingModel: 'subscription' }, { status: SubscriptionStatus.ACTIVE, currentPeriodEnd: future });
    await expect(paid.assertDriverCanWork('d1')).resolves.toBeUndefined();
    const none = service({ billingModel: 'subscription' }, null);
    await expect(none.assertDriverCanWork('d1')).rejects.toThrow(/subscription is inactive/);
  });

  it('only subscription-contract companies may buy a plan', async () => {
    for (const billingModel of ['commission', 'unassigned']) {
      const svc = service({ billingModel });
      await expect(svc.subscribe('u-company', 'plan-1')).rejects.toThrow(ForbiddenException);
    }
  });

  it('solo drivers on commission work without a plan and cannot buy one', async () => {
    const svc = service(null, null, { billingModel: 'commission', platformCommissionPct: 5 });
    await expect(svc.assertDriverCanWork('d1')).resolves.toBeUndefined();
    await expect(svc.driverSubscribe('u-driver', 'plan-1')).rejects.toThrow(ForbiddenException);
    const view = await svc.getMyDriverSubscription('u-driver');
    expect(view).toMatchObject({ driverContract: 'commission', companyContract: null });
  });

  it('solo drivers on subscription still need an active plan', async () => {
    const svc = service(null, null, { billingModel: 'subscription' });
    await expect(svc.assertDriverCanWork('d1')).rejects.toThrow(/subscription is inactive/);
  });
});
