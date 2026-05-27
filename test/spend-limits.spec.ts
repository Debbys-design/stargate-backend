import { BadRequestException } from '@nestjs/common';
import { InvoicesService } from '../src/invoices/invoices.service';

function makeService(merchant: any, dailyTotal = '0', monthlyTotal = '0') {
  const pool = {
    query: jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('date_trunc(\'day\'')) return Promise.resolve({ rows: [{ total: dailyTotal }] });
      if (sql.includes('date_trunc(\'month\'')) return Promise.resolve({ rows: [{ total: monthlyTotal }] });
      // nextInvoiceSequence
      if (sql.includes('COUNT(*)::bigint + 1')) return Promise.resolve({ rows: [{ next: '1' }] });
      // ensureMuxedBase
      if (sql.includes('muxed_base_id')) return Promise.resolve({ rows: [{ muxed_base_id: '0' }] });
      // insert
      return Promise.resolve({ rows: [{ id: 'inv-1' }] });
    }),
  };
  const merchants = { findOne: jest.fn().mockResolvedValue(merchant) };
  const stellar = { buildMuxedAddress: jest.fn().mockReturnValue('M...'), buildPaymentXdr: jest.fn() };
  const config = { get: jest.fn().mockReturnValue('https://pay.example.com') };
  return new (InvoicesService as any)(pool, merchants, stellar, config);
}

describe('InvoicesService – spend limits', () => {
  const baseMerchant = {
    id: 'm1', tier: 'standard', fee_bps: 50, fee_fixed_usdc: '0.25',
    daily_spend_limit_usdc: null, monthly_spend_limit_usdc: null,
  };

  it('creates invoice when no limits set', async () => {
    const svc = makeService(baseMerchant);
    await expect(svc.create('m1', { amount_usdc: 10, expires_in_minutes: 60 })).resolves.toBeDefined();
  });

  it('throws when daily limit exceeded', async () => {
    const merchant = { ...baseMerchant, daily_spend_limit_usdc: '50.0000000' };
    const svc = makeService(merchant, '45.0000000');
    await expect(svc.create('m1', { amount_usdc: 10, expires_in_minutes: 60 })).rejects.toThrow(BadRequestException);
  });

  it('throws when monthly limit exceeded', async () => {
    const merchant = { ...baseMerchant, monthly_spend_limit_usdc: '100.0000000' };
    const svc = makeService(merchant, '0', '95.0000000');
    await expect(svc.create('m1', { amount_usdc: 10, expires_in_minutes: 60 })).rejects.toThrow(BadRequestException);
  });

  it('allows invoice exactly at daily limit boundary', async () => {
    const merchant = { ...baseMerchant, daily_spend_limit_usdc: '50.0000000' };
    const svc = makeService(merchant, '40.0000000');
    await expect(svc.create('m1', { amount_usdc: 10, expires_in_minutes: 60 })).resolves.toBeDefined();
  });
});
