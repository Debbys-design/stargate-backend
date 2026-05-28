import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { Pool } from 'pg';
import { z } from 'zod';
import { DATABASE_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';

export const WEBHOOK_EVENT_TYPES = [
  'invoice.paid',
  'invoice.expired',
  'invoice.cancelled',
  'settlement.completed',
  'merchant.kyc.approved',
  'merchant.kyc.rejected',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

const createWebhookSchema = z.object({
  url: z.string().url().refine((url) => url.startsWith('https://'), 'Webhook URL must use https'),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1),
});

@Injectable()
export class WebhooksService {
  private readonly ROTATION_OVERLAP_HOURS = 24;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly audit: AuditService,
  ) {}

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
    const result = await this.pool.query(
      'SELECT id, url, events, active, created_at, secret_rotated_at FROM webhooks WHERE merchant_id=$1 ORDER BY created_at DESC',
      [merchantId],
    );
    return result.rows;
  }

  async deactivate(merchantId: string, id: string, actorIp?: string, actorEmail?: string) {
    const result = await this.pool.query(
      'UPDATE webhooks SET active=false WHERE id=$1 AND merchant_id=$2 RETURNING id, active',
      [id, merchantId],
    );
    if (result.rows.length === 0) throw new NotFoundException('Webhook not found');
    await this.audit.log(merchantId, 'webhook_deactivated', 'webhook', id, { actorIp, actorEmail });
    return result.rows[0];
  }

  async rotateSecret(merchantId: string, id: string) {
    const existing = await this.pool.query(
      'SELECT id FROM webhooks WHERE id=$1 AND merchant_id=$2 AND active=true',
      [id, merchantId],
    );
    if (!existing.rows[0]) throw new NotFoundException('Active webhook not found');

    const newSecret = `whsec_${randomBytes(32).toString('hex')}`;
    const newHashedSecret = createHash('sha256').update(newSecret).digest('hex');
    const result = await this.pool.query(
      `UPDATE webhooks
          SET previous_hashed_secret=hashed_secret, hashed_secret=$3, secret_rotated_at=NOW()
        WHERE id=$1 AND merchant_id=$2
        RETURNING id, url, events, active, secret_rotated_at`,
      [id, merchantId, newHashedSecret],
    );
    if (!result.rows[0]) throw new NotFoundException('Webhook not found');
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
          SET status='pending', next_retry_at=NOW(), attempts=0
         FROM webhooks w
        WHERE d.webhook_id=w.id AND w.merchant_id=$1 AND d.id=$2 AND d.status IN ('failed','dead')
        RETURNING d.*, w.id as webhook_id`,
      [merchantId, deliveryId],
    );
    if (result.rows.length === 0) throw new NotFoundException('Delivery not found or cannot be retried');
    await this.audit.log(merchantId, 'webhook_retried', 'webhook', result.rows[0].webhook_id, {
      actorIp,
      actorEmail,
      metadata: { deliveryId },
    });
    return result.rows[0];
  }

  async dispatchEvent(merchantId: string, eventType: WebhookEventType, payload: Record<string, unknown>) {
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

  async emitKycEvent(merchantId: string, status: 'approved' | 'rejected') {
    const eventType: WebhookEventType = `merchant.kyc.${status}`;
    await this.pool.query(
      `INSERT INTO webhook_deliveries (webhook_id, event_type, payload)
       SELECT id, $2, jsonb_build_object('merchant_id', $1::uuid, 'kyc_status', $3)
         FROM webhooks WHERE merchant_id=$1 AND active=true AND $2=ANY(events)`,
      [merchantId, eventType, status],
    );
  }

  async health(merchantId: string, webhookId: string) {
    const result = await this.pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status='delivered') AS delivered,
         COUNT(*) AS total,
         PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (delivered_at - created_at)) * 1000) AS latency_p99_ms,
         MAX(CASE WHEN status IN ('failed','dead') THEN created_at END) AS last_failure_at
       FROM webhook_deliveries d
       JOIN webhooks w ON w.id=d.webhook_id
       WHERE w.id=$1 AND w.merchant_id=$2`,
      [webhookId, merchantId],
    );
    const row = result.rows[0];
    const total = Number(row.total);
    return {
      success_rate: total === 0 ? null : Number(row.delivered) / total,
      latency_p99_ms: row.latency_p99_ms !== null ? Number(row.latency_p99_ms) : null,
      last_failure_at: row.last_failure_at ?? null,
    };
  }

  sign(secret: string, payload: unknown) {
    return `sha256=${createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex')}`;
  }

  verify(secret: string, payload: unknown, signature: string) {
    const expected = Buffer.from(this.sign(secret, payload));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  async verifyWithRotation(webhookId: string, payload: unknown, signature: string) {
    const webhook = await this.pool.query(
      'SELECT hashed_secret, previous_hashed_secret, secret_rotated_at FROM webhooks WHERE id=$1',
      [webhookId],
    );
    if (!webhook.rows[0]) return false;

    const { hashed_secret, previous_hashed_secret, secret_rotated_at } = webhook.rows[0];

    if (this.verify(hashed_secret, payload, signature)) return true;

    if (previous_hashed_secret && secret_rotated_at) {
      const hoursSinceRotation = (Date.now() - new Date(secret_rotated_at).getTime()) / (1000 * 60 * 60);
      if (hoursSinceRotation < this.ROTATION_OVERLAP_HOURS) {
        return this.verify(previous_hashed_secret, payload, signature);
      }
    }

    return false;
  }
}
