import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { z } from 'zod';
import { DATABASE_POOL } from '../database/database.module';

const updateMerchantSchema = z.object({
  name: z.string().min(1).optional(),
  stellar_address: z.string().regex(/^G[A-Z0-9]{10,}$/).optional(),
  settlement_cadence: z.enum(['daily', 'weekly']).optional(),
  min_invoice_usdc: z.string().regex(/^\d+(\.\d{1,7})?$/).optional(),
  max_invoice_usdc: z.string().regex(/^\d+(\.\d{1,7})?$/).optional(),
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

  async update(id: string, input: unknown) {
    const dto = updateMerchantSchema.parse(input);
    const current = await this.findOne(id);
    const result = await this.pool.query(
      `UPDATE merchants
         SET name=$2, stellar_address=$3, settlement_cadence=COALESCE($4, settlement_cadence), 
             min_invoice_usdc=COALESCE($5, min_invoice_usdc), max_invoice_usdc=COALESCE($6, max_invoice_usdc), updated_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [id, dto.name ?? current.name, dto.stellar_address ?? current.stellar_address, dto.settlement_cadence ?? null, dto.min_invoice_usdc ?? null, dto.max_invoice_usdc ?? null],
    );
    return result.rows[0];
  }
}
