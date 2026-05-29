import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module';

@Injectable()
export class SorobanEventsService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async list(merchantId: string, query: { contract_id?: string; page?: string; limit?: string }) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
    const offset = (page - 1) * limit;
    const params: any[] = [merchantId, limit, offset];
    const contractFilter = query.contract_id ? 'AND contract_id=$4' : '';
    if (query.contract_id) params.push(query.contract_id);
    const result = await this.pool.query(
      `SELECT *, COUNT(*) OVER() AS total
         FROM soroban_contract_events
        WHERE merchant_id=$1 ${contractFilter}
        ORDER BY ledger_sequence DESC
        LIMIT $2 OFFSET $3`,
      params,
    );
    return { page, limit, total: Number(result.rows[0]?.total ?? 0), items: result.rows };
  }
}
