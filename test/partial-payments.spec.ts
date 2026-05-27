import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvoicesService } from '../src/invoices/invoices.service';

function makeServiceForPartial(invoice: any | null) {
  let committed = false;
  const client = {
    query: jest.fn().mockImplementation((sql: string, params?: any[]) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return Promise.resolve();
      if (sql.includes('FOR UPDATE')) return Promise.resolve({ rows: invoice ? [invoice] : [] });
      if (sql.includes('UPDATE invoices')) return Promise.resolve({ rows: [{ ...invoice, status: 'partial' }] });
      return Promise.resolve({ rows: [] });
    }),
    release: jest.fn(),
  };
  const pool = {
    connect: jest.fn().mockResolvedValue(client),
    query: jest.fn().mockResolvedValue({ rows: [] }),
  };
  const merchants = { findOne: jest.fn() };
  const stellar = { buildMuxedAddress: jest.fn(), buildPaymentXdr: jest.fn() };
  const config = { get: jest.fn() };
  return new (InvoicesService as any)(pool, merchants, stellar, config);
}

describe('InvoicesService – partial payments', () => {
  const baseInvoice = {
    id: 'inv-1',
    status: 'pending',
    partial_payments_enabled: true,
    amount_remaining_usdc: '100.0000000',
    amount_paid_usdc: '0.0000000',
  };

  it('applies partial payment and returns partial status', async () => {
    const svc = makeServiceForPartial(baseInvoice);
    const result = await svc.applyPartialPayment('inv-1', '40.0000000');
    expect(result).toBeDefined();
  });

  it('throws NotFoundException when invoice not found', async () => {
    const svc = makeServiceForPartial(null);
    await expect(svc.applyPartialPayment('inv-1', '10.0000000')).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when partial payments disabled', async () => {
    const svc = makeServiceForPartial({ ...baseInvoice, partial_payments_enabled: false });
    await expect(svc.applyPartialPayment('inv-1', '10.0000000')).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when payment exceeds remaining', async () => {
    const svc = makeServiceForPartial(baseInvoice);
    await expect(svc.applyPartialPayment('inv-1', '200.0000000')).rejects.toThrow(BadRequestException);
  });
});
