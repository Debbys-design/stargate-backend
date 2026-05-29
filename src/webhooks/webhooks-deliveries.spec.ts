import { NotFoundException } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';

const merchantId = 'merchant-1';
const webhookId = 'webhook-uuid-1';
const deliveryId = '42';

function makeService(queryMock: jest.Mock) {
  const pool = { query: queryMock };
  const audit = { log: jest.fn() };
  return new WebhooksService(pool as any, audit as any);
}

describe('WebhooksService.deliveries', () => {
  it('returns delivery list for a valid webhook', async () => {
    const rows = [
      { id: 1, webhook_id: webhookId, event_type: 'invoice.paid', status: 'delivered', attempts: 1, created_at: new Date().toISOString() },
    ];
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: webhookId }] }) // ownership check
      .mockResolvedValueOnce({ rows });

    const svc = makeService(query);
    const result = await svc.deliveries(merchantId, webhookId);
    expect(result).toEqual(rows);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('throws NotFoundException when webhook does not belong to merchant', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [] });
    const svc = makeService(query);
    await expect(svc.deliveries(merchantId, webhookId)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('WebhooksService.deliveryById', () => {
  it('returns a single delivery with payload', async () => {
    const row = {
      id: Number(deliveryId),
      webhook_id: webhookId,
      event_type: 'invoice.paid',
      payload: { invoice_id: 'inv-1' },
      status: 'delivered',
      attempts: 1,
      response_status: 200,
      delivered_at: new Date().toISOString(),
      next_retry_at: null,
      created_at: new Date().toISOString(),
    };
    const query = jest.fn().mockResolvedValueOnce({ rows: [row] });
    const svc = makeService(query);
    const result = await svc.deliveryById(merchantId, webhookId, deliveryId);
    expect(result).toEqual(row);
    // Verify the query scopes by merchant, webhook, and delivery id
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('merchant_id');
    expect(params).toContain(merchantId);
    expect(params).toContain(webhookId);
    expect(params).toContain(deliveryId);
  });

  it('throws NotFoundException when delivery does not exist', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [] });
    const svc = makeService(query);
    await expect(svc.deliveryById(merchantId, webhookId, deliveryId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException when delivery belongs to a different merchant', async () => {
    // Simulates the JOIN filtering out the row
    const query = jest.fn().mockResolvedValueOnce({ rows: [] });
    const svc = makeService(query);
    await expect(svc.deliveryById('other-merchant', webhookId, deliveryId)).rejects.toBeInstanceOf(NotFoundException);
  });
});
