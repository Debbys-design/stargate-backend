import { InvoicesService } from './invoices.service';

describe('InvoicesService.expireInvoices', () => {
  it('dispatches merchant.payment_intent.expired for each expired invoice', async () => {
    const expiredRows = [
      { id: 'inv-1', merchant_id: 'mer-1' },
      { id: 'inv-2', merchant_id: 'mer-2' },
    ];
    const pool = { query: jest.fn().mockResolvedValue({ rows: expiredRows }) } as any;
    const webhooks = { dispatchEvent: jest.fn().mockResolvedValue(undefined) } as any;
    const service = new InvoicesService(pool, null as any, null as any, null as any, webhooks);

    await service.expireInvoices();

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("status='expired'"),
    );
    expect(webhooks.dispatchEvent).toHaveBeenCalledTimes(2);
    expect(webhooks.dispatchEvent).toHaveBeenCalledWith('mer-1', 'merchant.payment_intent.expired', expect.objectContaining({ invoice_id: 'inv-1' }));
    expect(webhooks.dispatchEvent).toHaveBeenCalledWith('mer-2', 'merchant.payment_intent.expired', expect.objectContaining({ invoice_id: 'inv-2' }));
  });
});
