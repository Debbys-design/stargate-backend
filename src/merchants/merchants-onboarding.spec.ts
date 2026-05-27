import { MerchantsService } from './merchants.service';

const merchantId = 'merchant-1';

function makePool(merchantRow: any, counts: [number, number, number]) {
  return {
    query: jest.fn()
      .mockResolvedValueOnce({ rows: [merchantRow] })          // findOne
      .mockResolvedValueOnce({ rows: [], rowCount: counts[0] }) // invoices
      .mockResolvedValueOnce({ rows: [], rowCount: counts[1] }) // webhooks
      .mockResolvedValueOnce({ rows: [], rowCount: counts[2] }), // schedules
  };
}

describe('MerchantsService.onboarding', () => {
  it('returns all steps done when merchant is fully set up', async () => {
    const merchant = { id: merchantId, name: 'Acme', stellar_address: 'GABC', kyb_verified_at: new Date() };
    const pool = makePool(merchant, [1, 1, 1]);
    const svc = new MerchantsService(pool as any);
    const result = await svc.onboarding(merchantId);
    expect(result.completed).toBe(5);
    expect(result.percent).toBe(100);
    expect(result.steps.every((s: any) => s.done)).toBe(true);
  });

  it('returns partial completion for new merchant', async () => {
    const merchant = { id: merchantId, name: 'Acme', stellar_address: null, kyb_verified_at: null };
    const pool = makePool(merchant, [0, 0, 0]);
    const svc = new MerchantsService(pool as any);
    const result = await svc.onboarding(merchantId);
    expect(result.completed).toBe(0); // no stellar_address, no kyb, no activity
    expect(result.percent).toBe(0);
  });

  it('has correct step keys', async () => {
    const merchant = { id: merchantId, name: 'X', stellar_address: 'G1', kyb_verified_at: null };
    const pool = makePool(merchant, [0, 0, 0]);
    const svc = new MerchantsService(pool as any);
    const { steps } = await svc.onboarding(merchantId);
    expect(steps.map((s: any) => s.key)).toEqual([
      'profile_complete', 'kyb_verified', 'first_invoice', 'webhook_configured', 'schedule_created',
    ]);
  });
});
