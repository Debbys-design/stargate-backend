import { Inject, Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { z } from 'zod';
import { DATABASE_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';

const createWebhookSchema = z.object({
  url: z.string().url().refine((url) => url.startsWith('https://'), 'Webhook URL must use https'),
  events: z.array(z.enum(['invoice.paid', 'invoice.expired', 'invoice.cancelled', 'settlement.completed'])).min(1),
});

@Injectable()
export class WebhooksService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly audit: AuditService,
  ) {}
  private readonly ROTATION_OVERLAP_HOURS = 24;

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async create(merchantId: string, input: unknown, actorIp?: string, actorEmail?: string) {
    const dto = createWebhookSchema.parse(input);
    const secret = `whsec_${randomBytes(32).toString('hex')}`;
    const hashedSecret = createHash('sha256').update(secret).digest('hex');
    const result = await this.pool.query(
      `INSERT INTO webhooks (merchant_id, url, events, hashed_secret) VALUES ($1,$2,$3,$4) RETURNING id, url, events, active, created_at`,
      [merchantId, dto.url, dto.events, hashedSecret],
    );
    const webhook = result.rows[0];
    await this.audit.log(merchantId, 'webhook_created', 'webhook', webhook.id, {
      actorIp,
      actorEmail,
      metadata: { url: webhook.url, events: webhook.events },
    });
    return { ...webhook, secret };
  }

  async list(merchantId: string) {
    const result = await this.pool.query('SELECT id, url, events, active, created_at FROM webhooks WHERE merchant_id=$1 ORDER BY created_at DESC', [merchantId]);
    return result.rows;
  }

  async deactivate(merchantId: string, id: string, actorIp?: string, actorEmail?: string) {
    const result = await this.pool.query('UPDATE webhooks SET active=false WHERE id=$1 AND merchant_id=$2 RETURNING id, active', [id, merchantId]);
    if (result.rows[0]) {
      await this.audit.log(merchantId, 'webhook_deactivated', 'webhook', id, {
        actorIp,
        actorEmail,
      });
    }
    if (result.rows.length === 0) throw new NotFoundException('Webhook not found');
    return result.rows[0];
  }

  async rotateSecret(merchantId: string, id: string) {
    const newSecret = `whsec_${randomBytes(32).toString('hex')}`;
    const result = await this.pool.query(
      `UPDATE webhooks 
        SET previous_secret=secret, secret=$3, secret_rotated_at=NOW()
        WHERE id=$1 AND merchant_id=$2
        RETURNING id, secret`,
      [id, merchantId, newSecret],
    );
    if (!result.rows[0]) throw new Error('Webhook not found');
    return { ...result.rows[0], secret: newSecret };
  }

  async deliveries(merchantId: string, webhookId: string) {
    const result = await this.pool.query(
      `SELECT d.* FROM webhook_deliveries d JOIN webhooks w ON w.id=d.webhook_id WHERE w.merchant_id=$1 AND w.id=$2 ORDER BY d.created_at DESC`,
      [merchantId, webhookId],
    );
    return result.rows;
  }

  async retry(merchantId: string, deliveryId: string, actorIp?: string, actorEmail?: string) {
    const result = await this.pool.query(
      `UPDATE webhook_deliveries d
          SET status='pending', next_retry_at=NOW()
         FROM webhooks w
        WHERE d.webhook_id=w.id AND w.merchant_id=$1 AND d.id=$2
        RETURNING d.*, w.id as webhook_id`,
      [merchantId, deliveryId],
    );
    if (result.rows[0]) {
      await this.audit.log(merchantId, 'webhook_retried', 'webhook', result.rows[0].webhook_id, {
        actorIp,
        actorEmail,
        metadata: { deliveryId },
      });
    }
        WHERE d.webhook_id=w.id AND w.merchant_id=$1 AND d.id=$2 AND d.status IN ('failed','dead')
        RETURNING d.*`,
      [merchantId, deliveryId],
    );
    if (result.rows.length === 0) throw new NotFoundException('Delivery not found or cannot be retried');
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

  async getSecretForVerification(webhookId: string): Promise<string | null> {
    const result = await this.pool.query('SELECT hashed_secret FROM webhooks WHERE id=$1', [webhookId]);
    return result.rows[0]?.hashed_secret ?? null;
  async verifyWithRotation(webhookId: string, payload: unknown, signature: string) {
    const webhook = await this.pool.query('SELECT secret, previous_secret, secret_rotated_at FROM webhooks WHERE id=$1', [webhookId]);
    if (!webhook.rows[0]) return false;

    const { secret, previous_secret, secret_rotated_at } = webhook.rows[0];

    // Try current secret
    if (this.verify(secret, payload, signature)) return true;

    // Try previous secret if within overlap window
    if (previous_secret && secret_rotated_at) {
      const rotatedTime = new Date(secret_rotated_at);
      const now = new Date();
      const hoursSinceRotation = (now.getTime() - rotatedTime.getTime()) / (1000 * 60 * 60);
      if (hoursSinceRotation < this.ROTATION_OVERLAP_HOURS) {
        return this.verify(previous_secret, payload, signature);
      }
    }

    return false;
  }
}
