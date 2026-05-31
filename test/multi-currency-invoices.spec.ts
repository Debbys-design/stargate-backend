import { BadRequestException } from '@nestjs/common';
import { InvoicesService } from '../src/invoices/invoices.service';

/** Build a minimal InvoicesService with mocked dependencies. */
function makeService(overrides: {
  fxRate?: number;
  merchantAcceptedAssets?: string[] | null;
  merchantTier?: string;
} = {}) {
  const { fxRate = 1.08, merchantAcceptedAssets = null, merchantTier = 'starter' } = overrides;

  const merchant = {
    id: 'merchant-1',
    tier: merchantTier,
    accepted_assets: merchantAcceptedAssets,
    min_invoice_usdc: null,
    max_invoice_usdc: null,
    daily_spend_limit_usdc: null,
    monthly_spend_limit_usdc: null,
    muxed_base_id: '1000000',
    fee_bps: 50,
    fee_fixed_usdc: '0.25',
  };

  const pool = {
    query: jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('idempotency_key')) return Promise.resolve({ rows: [] });
      if (sql.includes('muxed_base_id')) return Promise.resolve({ rows: [{ muxed_base_id: '1000000' }] });
      if (sql.includes('COUNT(*)::bigint + 1')) return Promise.resolve({ rows: [{ next: '1' }] });
      if (sql.includes('INSERT INTO invoices')) {
        return Promise.resolve({
          rows: [{
            id: 'inv-uuid',
            currency: 'EURC',
            amount_usdc: '10.0000000',
            gross_usdc: '10.5400000',
            gross_usdc_equiv: '11.3832000',
            fee_usdc: '0.5400000',
            net_usdc: '9.7500000',
            status: 'pending',
            payment_url: 'https://pay.stargate.finance/pay/inv-uuid',
          }],
        });
      }
      if (sql.includes('SUM')) return Promise.resolve({ rows: [{ total: '0' }] });
      return Promise.resolve({ rows: [] });
    }),
    connect: jest.fn(),
  };

  const merchants = { findOne: jest.fn().mockResolvedValue(merchant) };
  const stellar = { buildMuxedAddress: jest.fn().mockReturnValue('MTEST123') };
  const config = { get: jest.fn().mockReturnValue('https://pay.stargate.finance') };
  const webhooks = { dispatchEvent: jest.fn() };
  const idempotency = {
    hashBody: jest.fn().mockReturnValue('hash'),
    check: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const fx = {
    toUsdc: jest.fn().mockImplementation(async (amount: string, currency: string) => {
      if (currency === 'USDC') return amount;
      return (parseFloat(amount) * fxRate).toFixed(7);
    }),
    getRate: jest.fn().mockResolvedValue(fxRate),
  };

  return new (InvoicesService as any)(pool, merchants, stellar, config, webhooks, idempotency, fx);
}

describe('InvoicesService – multi-currency', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a USDC invoice (legacy amount_usdc field)', async () => {
    const svc = makeService();
    const result = await svc.create('merchant-1', { amount_usdc: '10', currency: 'USDC' });
    expect(result).toBeDefined();
    expect(result.status).toBe('pending');
  });

  it('creates a EURC invoice using amount field', async () => {
    const svc = makeService({ fxRate: 1.08 });
    const result = await svc.create('merchant-1', { amount: '10', currency: 'EURC' });
    expect(result).toBeDefined();
    expect(result.currency).toBe('EURC');
  });

  it('creates an XLM invoice', async () => {
    const svc = makeService({ fxRate: 0.11 });
    const result = await svc.create('merchant-1', { amount: '100', currency: 'XLM' });
    expect(result).toBeDefined();
  });

  it('throws BadRequestException when currency not in merchant accepted_assets', async () => {
    const svc = makeService({ merchantAcceptedAssets: ['USDC'] });
    await expect(
      svc.create('merchant-1', { amount: '10', currency: 'EURC' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when amount is missing', async () => {
    const svc = makeService();
    await expect(
      svc.create('merchant-1', { currency: 'USDC' }),
    ).rejects.toThrow();
  });

  it('accepts EURC when merchant accepted_assets includes EURC', async () => {
    const svc = makeService({ merchantAcceptedAssets: ['USDC', 'EURC'] });
    const result = await svc.create('merchant-1', { amount: '10', currency: 'EURC' });
    expect(result).toBeDefined();
  });

  it('converts EURC amount to USDC equivalent for fee calculation', async () => {
    const fxRate = 1.08;
    const svc = makeService({ fxRate });
    const fx = (svc as any).fx;
    await svc.create('merchant-1', { amount: '10', currency: 'EURC' });
    expect(fx.toUsdc).toHaveBeenCalledWith('10', 'EURC');
  });
});
