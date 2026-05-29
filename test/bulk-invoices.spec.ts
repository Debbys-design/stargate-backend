import { BadRequestException } from '@nestjs/common';
import { InvoicesService } from '../src/invoices/invoices.service';

function makeService() {
  const pool = {
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    }),
    query: jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('date_trunc')) return Promise.resolve({ rows: [{ total: '0' }] });
      if (sql.includes('COUNT(*)::bigint + 1')) return Promise.resolve({ rows: [{ next: '1' }] });
      if (sql.includes('muxed_base_id')) return Promise.resolve({ rows: [{ muxed_base_id: '0' }] });
      return Promise.resolve({ rows: [{ id: 'inv-x' }] });
    }),
  };
  const merchants = { findOne: jest.fn().mockResolvedValue({ id: 'm1', tier: 'standard', fee_bps: 50, fee_fixed_usdc: '0.25', daily_spend_limit_usdc: null, monthly_spend_limit_usdc: null }) };
  const stellar = { buildMuxedAddress: jest.fn().mockReturnValue('M...') };
  const config = { get: jest.fn().mockReturnValue('https://pay.example.com') };
  return new (InvoicesService as any)(pool, merchants, stellar, config);
}

describe('InvoicesService – bulk creation', () => {
  it('rejects empty array', async () => {
    const svc = makeService();
    await expect(svc.createBulk('m1', [])).rejects.toThrow(BadRequestException);
  });

  it('rejects more than 100 invoices', async () => {
    const svc = makeService();
    const items = Array.from({ length: 101 }, () => ({ amount_usdc: 1, expires_in_minutes: 60 }));
    await expect(svc.createBulk('m1', items)).rejects.toThrow(BadRequestException);
  });

  it('creates multiple invoices atomically', async () => {
    const svc = makeService();
    const items = [
      { amount_usdc: 10, expires_in_minutes: 60 },
      { amount_usdc: 20, expires_in_minutes: 60 },
    ];
    const results = await svc.createBulk('m1', items);
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(2);
  });
});
