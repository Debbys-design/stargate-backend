import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module';

@Injectable()
export class IdempotencyService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  /** Hash the request body so we can detect replays with a different body. */
  hashBody(body: unknown): string {
    return createHash('sha256').update(JSON.stringify(body)).digest('hex');
  }

  /**
   * Check for an existing idempotent response.
   * Returns the cached response if the key was already used with the same body,
   * throws ConflictException if the key was used with a different body,
   * or returns null if this is a new key.
   */
  async check(merchantId: string, key: string, bodyHash: string): Promise<unknown | null> {
    const result = await this.pool.query(
      'SELECT request_hash, response_body FROM idempotency_keys WHERE merchant_id=$1 AND key=$2',
      [merchantId, key],
    );
    if (!result.rows[0]) return null;
    if (result.rows[0].request_hash !== bodyHash) {
      throw new ConflictException('Idempotency key already used with a different request body');
    }
    return result.rows[0].response_body;
  }

  /** Persist the response so future replays return the same result. */
  async save(merchantId: string, key: string, bodyHash: string, response: unknown): Promise<void> {
    await this.pool.query(
      `INSERT INTO idempotency_keys (merchant_id, key, request_hash, response_body)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (merchant_id, key) DO NOTHING`,
      [merchantId, key, bodyHash, JSON.stringify(response)],
    );
  }
}
