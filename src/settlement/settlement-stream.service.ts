import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { Observable } from 'rxjs';
import { DATABASE_POOL } from '../database/database.module';
import { REDIS } from '../redis/redis.module';

@Injectable()
export class SettlementStreamService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
  ) {}

  streamSettlement(merchantId: string, settlementId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const channel = `settlement:${settlementId}`;
      const sub = this.redis.duplicate();
      const heartbeat = setInterval(
        () => subscriber.next({ data: { type: 'heartbeat' } } as MessageEvent),
        15_000,
      );

      // Emit current status immediately, then subscribe for updates
      this.pool
        .query('SELECT id, status, amount_usdc, tx_hash, settled_at FROM settlements WHERE id=$1 AND merchant_id=$2', [
          settlementId,
          merchantId,
        ])
        .then((result) => {
          if (!result.rows[0]) {
            subscriber.error(new NotFoundException('Settlement not found'));
            return;
          }
          subscriber.next({ data: { type: 'status', ...result.rows[0] } } as MessageEvent);
          if (result.rows[0].status === 'confirmed' || result.rows[0].status === 'failed') {
            subscriber.complete();
            return;
          }
          sub.subscribe(channel).then(() => undefined);
        })
        .catch((err) => subscriber.error(err));

      sub.on('message', (_ch, message) => {
        const data = JSON.parse(message);
        subscriber.next({ data } as MessageEvent);
        if (data.status === 'confirmed' || data.status === 'failed') subscriber.complete();
      });

      return () => {
        clearInterval(heartbeat);
        sub.disconnect();
      };
    });
  }
}
