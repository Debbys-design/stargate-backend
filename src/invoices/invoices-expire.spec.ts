import { InvoicesService } from './invoices.service';

describe('InvoicesService', () => {
  it('dispatches merchant.payment_intent.expired for each invoice expired by expires_at', async () => {
    const expiredRows = [
      { id: 'inv-1', merchant_id: 'mer-1' },
      { id: 'inv-2', merchant_id: 'mer-2' },
    ];

    const pool = { query: jest.fn().mockResolvedValue({ rows: expiredRows }) } as any;
    const webhooks = { dispatchEvent: jest.fn().mockResolvedValue(undefined) } as any;

    const service = new InvoicesService(pool, null as any, null as any, null as any, webhooks, null as any);

    await service.expireInvoices();

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("status='expired'"),
    );
    expect(webhooks.dispatchEvent).toHaveBeenCalledTimes(2);
    expect(webhooks.dispatchEvent).toHaveBeenCalledWith(
      'mer-1',
      'merchant.payment_intent.expired',
      expect.objectContaining({ invoice_id: 'inv-1', reason: 'expires_at' }),
    );
    expect(webhooks.dispatchEvent).toHaveBeenCalledWith(
      'mer-2',
      'merchant.payment_intent.expired',
      expect.objectContaining({ invoice_id: 'inv-2', reason: 'expires_at' }),
    );
  });

  it('auto-cancels unpaid invoices and dispatches cancellation notifications', async () => {
    const cancelledRows = [
      { id: 'inv-3', merchant_id: 'mer-3' },
      { id: 'inv-4', merchant_id: 'mer-4' },
    ];

    const pool = {
      query: jest.fn()
        // first call: expireInvoices, but we won't call it here
        .mockResolvedValue({ rows: cancelledRows }),
    } as any;

    const webhooks = { dispatchEvent: jest.fn().mockResolvedValue(undefined) } as any;
    const service = new InvoicesService(pool, null as any, null as any, null as any, webhooks, null as any);

    await service.autoCancelUnpaidInvoices();

    // Should update invoices for cancelled rows and dispatch two events per invoice
    expect(webhooks.dispatchEvent).toHaveBeenCalledTimes(4);

    expect(webhooks.dispatchEvent).toHaveBeenCalledWith(
      'mer-3',
      'merchant.payment_intent.expired',
      expect.objectContaining({ invoice_id: 'inv-3', reason: 'unpaid_invoice_ttl' }),
    );

    expect(webhooks.dispatchEvent).toHaveBeenCalledWith(
      'mer-3',
      'invoice.cancelled',
      expect.objectContaining({ invoice_id: 'inv-3', reason: 'unpaid_invoice_ttl' }),
    );
  });
});

