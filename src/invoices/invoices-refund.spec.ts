import { BadRequestException } from '@nestjs/common';
import { InvoicesService } from './invoices.service';

const merchantId = 'merchant-1';
const invoiceId = 'inv-1';

const paidInvoice = {
  id: invoiceId, status: 'paid', amount_usdc: '10.0000000',
  gross_usdc: '10.5000000', muxed_address: 'MABC', payment_events: [],
};
const merchant = { stellar_address: 'GABC123' };

describe('InvoicesService.refund', () => {
  it('initiates a refund for a paid invoice', async () => {
    const refundRow = { id: 'ref-1', invoice_id: invoiceId, status: 'submitted', soroban_tx_hash: 'hash-abc' };
    const ctx: any = {
      get: jest.fn().mockResolvedValue(paidInvoice),
      merchants: { findOne: jest.fn().mockResolvedValue(merchant) },
      stellar: { submitSorobanRefund: jest.fn().mockResolvedValue('hash-abc') },
      pool: {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [refundRow] }),
      },
    };
    const result = await InvoicesService.prototype.refund.call(ctx, merchantId, invoiceId);
    expect(result.status).toBe('submitted');
    expect(result.soroban_tx_hash).toBe('hash-abc');
  });

  it('rejects refund on non-paid invoice', async () => {
    const ctx: any = {
      get: jest.fn().mockResolvedValue({ ...paidInvoice, status: 'pending' }),
    };
    await expect(InvoicesService.prototype.refund.call(ctx, merchantId, invoiceId))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate refund', async () => {
    const ctx: any = {
      get: jest.fn().mockResolvedValue(paidInvoice),
      pool: { query: jest.fn().mockResolvedValueOnce({ rows: [{ id: 'ref-existing' }] }) },
    };
    await expect(InvoicesService.prototype.refund.call(ctx, merchantId, invoiceId))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
