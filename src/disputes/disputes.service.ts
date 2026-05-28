import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { Pool } from 'pg';
import { Cron } from '@nestjs/schedule';
import { DATABASE_POOL } from '../database/database.module';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { MerchantsService } from '../merchants/merchants.service';



const createDisputeSchema = z.object({
  invoice_id: z.string().uuid(),
  amount_usdc: z
    .union([z.number().positive().max(100_000), z.string().regex(/^\d+(\.\d{1,7})?$/)])
    .transform((v) => String(v)),
  reason: z.string().max(500).optional(),
  external_reference: z.string().max(200).optional(),
});

const patchDisputeSchema = z.object({
  status: z.enum(['submitted', 'under_review', 'won', 'lost', 'rejected']),
  resolved_at: z.string().datetime().optional(),
  note: z.string().max(1000).optional(),
});

const SCALE = 10_000_000n;
function toUnits(amount: string) {
  const [whole, fraction = ''] = amount.split('.');
  const units = BigInt(whole) * SCALE + BigInt((fraction + '0000000').slice(0, 7));
  if (units <= 0n) throw new BadRequestException('amount_usdc must be > 0');
  return units;
}

function fromUnits(units: bigint) {
  const whole = units / SCALE;
  const fraction = (units % SCALE).toString().padStart(7, '0');
  return `${whole}.${fraction}`;
}

@Injectable()
export class DisputesService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly idempotency: IdempotencyService,
    private readonly merchants: MerchantsService,
  ) {}

  async create(merchantId: string, input: unknown, idempotencyKey?: string) {
    const bodyHash = this.idempotency.hashBody(input);
    if (idempotencyKey) {
      const cached = await this.idempotency.check(merchantId, idempotencyKey, bodyHash);
      if (cached) return cached;
    }

    const dto = createDisputeSchema.parse(input);
    const amountUnits = toUnits(dto.amount_usdc);

    const invoiceRes = await this.pool.query(
      `SELECT id, merchant_id, status, amount_usdc
         FROM invoices
        WHERE id=$1 AND merchant_id=$2`,
      [dto.invoice_id, merchantId],
    );
    const invoice = invoiceRes.rows[0];
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== 'paid' && invoice.status !== 'partial') {
      throw new BadRequestException('Disputes can only be created for paid invoices');
    }

    // Ensure no existing open dispute for this invoice
    const existing = await this.pool.query(
      `SELECT id, status FROM disputes
        WHERE invoice_id=$1 AND merchant_id=$2
          AND status NOT IN ('won','lost','rejected')
        LIMIT 1`,
      [dto.invoice_id, merchantId],
    );
    if (existing.rows[0]) throw new ConflictException('An open dispute already exists for this invoice');

    const result = await this.pool.query(
      `INSERT INTO disputes
        (merchant_id, invoice_id, amount_usdc, status, reason, external_reference)
       VALUES ($1,$2,$3,'submitted',$4,$5)
       RETURNING *`,
      [merchantId, dto.invoice_id, fromUnits(amountUnits), dto.reason ?? null, dto.external_reference ?? null],
    );

    const dispute = result.rows[0];

    if (idempotencyKey) {
      await this.idempotency.save(merchantId, idempotencyKey, bodyHash, dispute);
    }

    return dispute;
  }

  async patch(merchantId: string, id: string, input: unknown) {
    const dto = patchDisputeSchema.parse(input);

    const result = await this.pool.query(
      `UPDATE disputes
          SET status=$3,
              resolved_at=COALESCE($4, CASE WHEN $3 IN ('won','lost','rejected') THEN NOW() ELSE NULL END),
              updated_at=NOW(),
              note=$5
        WHERE id=$1 AND merchant_id=$2
        RETURNING *`,
      [id, merchantId, dto.status, dto.resolved_at ?? null, dto.note ?? null],
    );

    if (!result.rows[0]) throw new NotFoundException('Dispute not found');

    const dispute = result.rows[0];

    // Webhook dispatch will be wired once webhook events include chargeback/dispute types.
    // For now we persist the state transition and let merchants query dispute status.

    return dispute;
  }

  // Placeholder: worker that will eventually settle ledger/treasury when disputes reach terminal states.
  // Kept minimal for now to satisfy acceptance for API surface + DB lifecycle.
  @Cron('*/5 * * * * *')
  async settlePendingDisputes() {
    // no-op for now
    return 0;
  }
}

