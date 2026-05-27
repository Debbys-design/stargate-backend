import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { z } from 'zod';
import { DATABASE_POOL } from '../database/database.module';

const createWebhookSchema = z.object({
  url: z.string().url().refine((url) => url.startsWith('https://'), 'Webhook URL must use https'),
  events: z.array(z.enum(['invoice.paid', 'invoice.expired', 'invoice.cancelled', 'settlement.completed'])).min(1),
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
    const result = await this.pool.query(
      'SELECT id, url, events, active, created_at, secret_rotated_at FROM webhooks WHERE merchant_id=$1 ORDER BY created_at DESC',
      [merchantId],
    );
    return result.rows;
  }

  async deactivate(merchantId: string, id: string) {
    const result = await this.pool.query(
      'UPDATE webhooks SET active=false WHERE id=$1 AND merchant_id=$2 RETURNING id, active',
      [id, merchantId],
    );
    if (!result.rows[0]) throw new NotFoundException('Webhook not found');
    return result.rows[0];
  }

  async rotateSecret(merchantId: string, id: string) {
    const existing = await this.pool.query(
      'SELECT id, secret FROM webhooks WHERE id=$1 AND merchant_id=$2 AND active=true',
      [id, merchantId],
    );
    if (!existing.rows[0]) throw new NotFoundException('Active webhook not found');

    const newSecret = `whsec_${randomBytes(32).toString('hex')}`;
    const result = await this.pool.query(
      `UPDATE webhooks
          SET previous_secret=secret, secret=$2, secret_rotated_at=NOW()
        WHERE id=$1 AND merchant_id=$3
        RETURNING id, url, events, active, secret_rotated_at`,
      [id, newSecret, merchantId],
    );
    // Return new secret once — merchant must store it
    return { ...result.rows[0], secret: newSecret };
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

  sign(secret: string, payload: unknown) {
    return `sha256=${createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex')}`;
  }

  verify(secret: string, payload: unknown, signature: string) {
    const expected = Buffer.from(this.sign(secret, payload));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
