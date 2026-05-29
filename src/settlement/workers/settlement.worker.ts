import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../../database/database.module';
import { REDIS } from '../../redis/redis.module';
import { SettlementService } from '../settlement.service';

@Injectable()
export class SettlementWorker {
  constructor(
    private readonly settlement: SettlementService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
  ) {}

  @Cron('0 0 * * *')
  async runDailySettlement() {
    const count = await this.settlement.createDailySettlements();
    if (!count) return;
    const pending = await this.pool.query(
      `SELECT id, status, amount_usdc FROM settlements WHERE status='pending' AND created_at >= NOW() - INTERVAL '1 minute'`,
    );
    for (const row of pending.rows) {
      await this.redis.publish(
        `settlement:${row.id}`,
        JSON.stringify({ type: 'status', id: row.id, status: row.status, amount_usdc: row.amount_usdc }),
      );
    }
  }

  async publishStatusChange(settlementId: string, status: string, extra: Record<string, unknown> = {}) {
    await this.redis.publish(
      `settlement:${settlementId}`,
      JSON.stringify({ type: 'status', id: settlementId, status, ...extra }),
    );
  }
}
