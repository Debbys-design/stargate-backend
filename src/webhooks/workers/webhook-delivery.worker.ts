import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../../database/database.module';
import { WebhooksService } from '../webhooks.service';

const backoffMinutes = [0, 1, 5, 30, 120];

@Injectable()
export class WebhookDeliveryWorker {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly webhooks: WebhooksService,
    private readonly config: ConfigService,
  ) {}

  @Cron('*/30 * * * * *')
  async deliverPending() {
    const result = await this.pool.query(
      `SELECT d.*, w.url, w.secret, w.previous_secret, w.secret_rotated_at
         FROM webhook_deliveries d
         JOIN webhooks w ON w.id=d.webhook_id
        WHERE w.active=true
          AND d.status='pending'
          AND (d.next_retry_at IS NULL OR d.next_retry_at <= NOW())
        ORDER BY d.created_at
        LIMIT 50`,
    );

    for (const delivery of result.rows) {
      await this.deliver(delivery);
    }
  }

  private async deliver(delivery: any) {
    const attempts = Number(delivery.attempts) + 1;
    // During a 24-hour grace window after rotation, include both signatures
    // so the merchant can verify with either the old or new secret.
    const signatures = [this.webhooks.sign(delivery.secret, delivery.payload)];
    if (delivery.previous_secret && delivery.secret_rotated_at) {
      const rotatedAt = new Date(delivery.secret_rotated_at).getTime();
      const graceMs = 24 * 60 * 60 * 1000;
      if (Date.now() - rotatedAt < graceMs) {
        signatures.push(this.webhooks.sign(delivery.previous_secret, delivery.payload));
      }
    }

    try {
      const response = await fetch(delivery.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-stargate-signature': signatures[0],
          // Include previous signature in a separate header during grace period
          ...(signatures[1] ? { 'x-stargate-signature-prev': signatures[1] } : {}),
          'x-stargate-event': delivery.event_type,
        },
        body: JSON.stringify(delivery.payload),
        signal: AbortSignal.timeout(this.config.get<number>('WEBHOOK_TIMEOUT_MS', 5000)),
      });
      await this.pool.query(
        `UPDATE webhook_deliveries SET status=$2, attempts=$3, response_status=$4, delivered_at=CASE WHEN $2='delivered' THEN NOW() ELSE NULL END, next_retry_at=$5 WHERE id=$1`,
        [
          delivery.id,
          response.ok ? 'delivered' : attempts >= 5 ? 'dead' : 'pending',
          attempts,
          response.status,
          response.ok || attempts >= 5 ? null : this.nextRetry(attempts),
        ],
      );
    } catch {
      await this.pool.query(
        `UPDATE webhook_deliveries SET status=$2, attempts=$3, next_retry_at=$4 WHERE id=$1`,
        [delivery.id, attempts >= 5 ? 'dead' : 'pending', attempts, attempts >= 5 ? null : this.nextRetry(attempts)],
      );
    }
  }

  private nextRetry(attempts: number) {
    const minutes = backoffMinutes[Math.min(attempts, backoffMinutes.length - 1)];
    return new Date(Date.now() + minutes * 60_000);
  }
}
