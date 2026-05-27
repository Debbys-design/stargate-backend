import { Inject, Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { z } from 'zod';
import { DATABASE_POOL } from '../database/database.module';

const createWebhookSchema = z.object({
  url: z.string().url().refine((url) => url.startsWith('https://'), 'Webhook URL must use https'),
  events: z.array(z.enum(['invoice.paid', 'invoice.expired', 'invoice.cancelled', 'settlement.completed', 'merchant.payment_intent.expired'])).min(1),
});

@Injectable()
export class WebhooksService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async create(merchantId: string, input: unknown) {
    const dto = createWebhookSchema.parse(input);
    const secret = `whsec_${randomBytes(32).toString('hex')}`;
    const result = await this.pool.query(
      `INSERT INTO webhooks (merchant_id, url, events, secret) VALUES ($1,$2,$3,$4) RETURNING *`,
      [merchantId, dto.url, dto.events, secret],
    );
    return { ...result.rows[0], secret };
  }

  async list(merchantId: string) {
    const result = await this.pool.query('SELECT id, url, events, active, created_at FROM webhooks WHERE merchant_id=$1 ORDER BY created_at DESC', [merchantId]);
    return result.rows;
  }

  async deactivate(merchantId: string, id: string) {
    const result = await this.pool.query('UPDATE webhooks SET active=false WHERE id=$1 AND merchant_id=$2 RETURNING id, active', [id, merchantId]);
    return result.rows[0];
  }

  async deliveries(merchantId: string, webhookId: string) {
    const result = await this.pool.query(
      `SELECT d.* FROM webhook_deliveries d JOIN webhooks w ON w.id=d.webhook_id WHERE w.merchant_id=$1 AND w.id=$2 ORDER BY d.created_at DESC`,
      [merchantId, webhookId],
    );
    return result.rows;
  }

  async retry(merchantId: string, deliveryId: string) {
    const result = await this.pool.query(
      `UPDATE webhook_deliveries d
          SET status='pending', next_retry_at=NOW()
         FROM webhooks w
        WHERE d.webhook_id=w.id AND w.merchant_id=$1 AND d.id=$2
        RETURNING d.*`,
      [merchantId, deliveryId],
    );
    return result.rows[0];
  }

  async dispatchEvent(merchantId: string, eventType: string, payload: Record<string, unknown>) {
    const hooks = await this.pool.query(
      `SELECT id FROM webhooks WHERE merchant_id=$1 AND active=true AND $2=ANY(events)`,
      [merchantId, eventType],
    );
    for (const hook of hooks.rows) {
      await this.pool.query(
        `INSERT INTO webhook_deliveries (webhook_id, event_type, payload) VALUES ($1,$2,$3)`,
        [hook.id, eventType, payload],
      );
    }
  }

  sign(secret: string, payload: unknown) {
    return `sha256=${createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex')}`;
  }

  verify(secret: string, payload: unknown, signature: string) {
    const expected = Buffer.from(this.sign(secret, payload));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
