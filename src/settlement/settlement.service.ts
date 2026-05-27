import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module';
import { KmsSignerService } from '../stellar/kms-signer.service';

@Injectable()
export class SettlementService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool, private readonly kms: KmsSignerService) {}

  async createDailySettlements() {
    // Only settle merchants without a deferred schedule, or whose deferred time has passed
    const merchants = await this.pool.query(
      `SELECT merchant_id, SUM(net_usdc) AS amount
         FROM ledger_entries le
         JOIN merchants m ON m.id = le.merchant_id
        WHERE le.settlement_id IS NULL
          AND (m.settlement_scheduled_at IS NULL OR m.settlement_scheduled_at <= NOW())
        GROUP BY le.merchant_id
       HAVING SUM(net_usdc) >= 1.00`,
    );
    for (const merchant of merchants.rows) {
      await this.pool.query(
        `INSERT INTO settlements (merchant_id, amount_usdc, status) VALUES ($1,$2,'pending')`,
        [merchant.merchant_id, merchant.amount],
      );
      // Clear the one-time deferred schedule after triggering
      await this.pool.query(
        `UPDATE merchants SET settlement_scheduled_at=NULL WHERE id=$1 AND settlement_scheduled_at IS NOT NULL`,
        [merchant.merchant_id],
      );
    }
    return merchants.rowCount;
  }

  async signSettlementDigest(digest: Uint8Array) {
    return this.kms.signDigest(digest);
  }
}
