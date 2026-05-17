import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module';
import { KmsSignerService } from '../stellar/kms-signer.service';

@Injectable()
export class SettlementService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool, private readonly kms: KmsSignerService) {}

  async createDailySettlements() {
    const merchants = await this.pool.query(
      `SELECT merchant_id, SUM(net_usdc) AS amount
         FROM ledger_entries
        WHERE settlement_id IS NULL
        GROUP BY merchant_id
       HAVING SUM(net_usdc) >= 1.00`,
    );
    for (const merchant of merchants.rows) {
      await this.pool.query(
        `INSERT INTO settlements (merchant_id, amount_usdc, status) VALUES ($1,$2,'pending')`,
        [merchant.merchant_id, merchant.amount],
      );
    }
    return merchants.rowCount;
  }

  async signSettlementDigest(digest: Uint8Array) {
    return this.kms.signDigest(digest);
  }
}
