import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { z } from 'zod';
import { DATABASE_POOL } from '../database/database.module';

const updateMerchantSchema = z.object({
  name: z.string().min(1).optional(),
  stellar_address: z.string().regex(/^G[A-Z0-9]{10,}$/).optional(),
  settlement_cadence: z.enum(['daily', 'weekly']).optional(),
  test_mode: z.boolean().optional(),
});

@Injectable()
export class MerchantsService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async create(input: { email: string; name: string; passwordHash: string }) {
    const result = await this.pool.query(
      `INSERT INTO merchants (email, name, password_hash, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING *`,
      [input.email, input.name, input.passwordHash],
    );
    return result.rows[0];
  }

  async findByEmail(email: string) {
    const result = await this.pool.query('SELECT * FROM merchants WHERE email=$1', [email]);
    return result.rows[0] ?? null;
  }

  async findOne(id: string) {
    const result = await this.pool.query('SELECT * FROM merchants WHERE id=$1', [id]);
    if (!result.rows[0]) throw new NotFoundException('Merchant not found');
    return result.rows[0];
  }

  async updateKycStatus(id: string, status: 'approved' | 'rejected') {
    const result = await this.pool.query(
      `UPDATE merchants SET kyc_status=$2, kyb_verified_at=CASE WHEN $2='approved' THEN NOW() ELSE NULL END, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [id, status],
    );
    if (!result.rows[0]) throw new NotFoundException('Merchant not found');
    return result.rows[0];
  }

  async update(id: string, input: unknown) {
    const dto = updateMerchantSchema.parse(input);
    const current = await this.findOne(id);
    const result = await this.pool.query(
      `UPDATE merchants
         SET name=$2, stellar_address=$3, settlement_cadence=COALESCE($4, settlement_cadence),
             test_mode=COALESCE($5, test_mode), updated_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [id, dto.name ?? current.name, dto.stellar_address ?? current.stellar_address, dto.settlement_cadence ?? null, dto.test_mode ?? null],
    );
    return result.rows[0];
  }
}
