import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { z } from 'zod';
import { DATABASE_POOL } from '../database/database.module';
import { MerchantsService } from '../merchants/merchants.service';
import { StellarService } from '../stellar/stellar.service';

const createInvoiceSchema = z.object({
  amount_usdc: z
    .union([z.number().positive().max(100_000), z.string().regex(/^\d+(\.\d{1,7})?$/)])
    .transform((value) => String(value)),
  description: z.string().max(500).optional(),
  expires_in_minutes: z.number().int().min(5).max(10080).default(60),
});

const SCALE = 10_000_000n;

function toUnits(amount: string) {
  const [whole, fraction = ''] = amount.split('.');
  const units = BigInt(whole) * SCALE + BigInt((fraction + '0000000').slice(0, 7));
  if (units <= 0n) throw new BadRequestException('Amount must be greater than zero');
  return units;
}

function fromUnits(units: bigint) {
  const whole = units / SCALE;
  const fraction = (units % SCALE).toString().padStart(7, '0');
  return `${whole}.${fraction}`;
}

@Injectable()
export class InvoicesService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly merchants: MerchantsService,
    private readonly stellar: StellarService,
    private readonly config: ConfigService,
  ) {}

  async create(merchantId: string, input: unknown, idempotencyKey?: string) {
    const dto = createInvoiceSchema.parse(input);
    
    // Check for existing invoice with same idempotency key
    if (idempotencyKey) {
      const existing = await this.pool.query(
        'SELECT *, $3::text || \'/pay/\' || id AS payment_url FROM invoices WHERE merchant_id=$1 AND idempotency_key=$2',
        [merchantId, idempotencyKey, this.config.get<string>('PUBLIC_PAY_URL', 'https://pay.stargate.finance')],
      );
      if (existing.rows[0]) return existing.rows[0];
    }

    const merchant = await this.merchants.findOne(merchantId);
    const amount = toUnits(dto.amount_usdc);
    const fee = this.calculateFee(amount, merchant);
    const gross = amount + fee;
    const net = amount - this.fixedFeeUnits(merchant);
    const muxedBaseId = await this.ensureMuxedBase(merchantId);
    const next = await this.nextInvoiceSequence(merchantId);
    const muxedId = muxedBaseId + next;
    const muxedAddress = this.stellar.buildMuxedAddress(muxedId);
    const expiresAt = new Date(Date.now() + dto.expires_in_minutes * 60_000);

    const result = await this.pool.query(
      `INSERT INTO invoices
         (merchant_id, amount_usdc, gross_usdc, fee_usdc, net_usdc, description, muxed_id, muxed_address, expires_at, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *, $11::text || '/pay/' || id AS payment_url`,
      [
        merchantId,
        fromUnits(amount),
        fromUnits(gross),
        fromUnits(fee),
        fromUnits(net > 0n ? net : 0n),
        dto.description ?? null,
        muxedId.toString(),
        muxedAddress,
        expiresAt,
        idempotencyKey ?? null,
        this.config.get<string>('PUBLIC_PAY_URL', 'https://pay.stargate.finance'),
      ],
    );
    return result.rows[0];
  }

  async list(merchantId: string, query: any) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
    const status = query.status;
    const params: any[] = [merchantId, limit, (page - 1) * limit];
    const statusSql = status ? 'AND status=$4' : '';
    if (status) params.push(status);
    const result = await this.pool.query(
      `SELECT *, COUNT(*) OVER() AS total
         FROM invoices
        WHERE merchant_id=$1 ${statusSql}
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      params,
    );
    return { page, limit, total: Number(result.rows[0]?.total ?? 0), items: result.rows };
  }

  async get(merchantId: string, id: string) {
    const invoice = await this.pool.query('SELECT * FROM invoices WHERE id=$1 AND merchant_id=$2', [id, merchantId]);
    if (!invoice.rows[0]) throw new NotFoundException('Invoice not found');
    const events = await this.pool.query('SELECT * FROM payment_events WHERE invoice_id=$1 ORDER BY created_at DESC', [id]);
    return { ...invoice.rows[0], payment_events: events.rows };
  }

  async getPublic(id: string) {
    const result = await this.pool.query(
      `SELECT i.id, i.gross_usdc, i.description, i.status, i.muxed_address, i.expires_at, m.name AS merchant_name
         FROM invoices i
         JOIN merchants m ON m.id=i.merchant_id
        WHERE i.id=$1`,
      [id],
    );
    if (!result.rows[0]) throw new NotFoundException('Invoice not found');
    return result.rows[0];
  }

  async cancel(merchantId: string, id: string) {
    const result = await this.pool.query(
      `UPDATE invoices SET status='cancelled'
        WHERE id=$1 AND merchant_id=$2 AND status='pending'
        RETURNING *`,
      [id, merchantId],
    );
    if (!result.rows[0]) throw new NotFoundException('Pending invoice not found');
    return result.rows[0];
  }

  @Cron('0 */5 * * * *')
  async expireInvoices() {
    await this.pool.query(`UPDATE invoices SET status='expired' WHERE status='pending' AND expires_at < NOW()`);
  }

  private calculateFee(amount: bigint, merchant: any) {
    const bps = merchant.tier === 'pro' ? 30n : merchant.tier === 'enterprise' ? BigInt(merchant.fee_bps) : 50n;
    return (amount * bps) / 10_000n + this.fixedFeeUnits(merchant);
  }

  private fixedFeeUnits(merchant: any) {
    if (merchant.tier === 'pro') return toUnits('0.10');
    if (merchant.tier === 'enterprise') return toUnits(String(merchant.fee_fixed_usdc));
    return toUnits('0.25');
  }

  private async ensureMuxedBase(merchantId: string) {
    const current = await this.pool.query('SELECT muxed_base_id FROM merchants WHERE id=$1', [merchantId]);
    if (current.rows[0]?.muxed_base_id) return BigInt(current.rows[0].muxed_base_id);
    const index = await this.pool.query(`SELECT COUNT(*)::bigint AS index FROM merchants WHERE created_at <= (SELECT created_at FROM merchants WHERE id=$1)`, [merchantId]);
    const base = BigInt(index.rows[0].index) * 16_777_216n;
    await this.pool.query('UPDATE merchants SET muxed_base_id=$2 WHERE id=$1', [merchantId, base.toString()]);
    return base;
  }

  private async nextInvoiceSequence(merchantId: string) {
    const result = await this.pool.query('SELECT COUNT(*)::bigint + 1 AS next FROM invoices WHERE merchant_id=$1', [merchantId]);
    return BigInt(result.rows[0].next);
  }
}
