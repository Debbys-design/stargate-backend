import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { z } from 'zod';
import { DATABASE_POOL } from '../database/database.module';
import { REDIS } from '../redis/redis.module';

export type ScreeningResult = { result: 'clear' | 'blocked' | 'review'; risk_score: number };

const uploadDocumentSchema = z.object({
  document_type: z.enum(['passport', 'drivers_license', 'national_id', 'utility_bill', 'bank_statement']),
  file_name: z.string().min(1).max(255),
});

@Injectable()
export class ComplianceService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly config: ConfigService,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
  ) {}

  async screenAddress(address: string): Promise<ScreeningResult> {
    const key = `ofac:${address}`;
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached);
    if (this.config.get<string>('OFAC_SCREENING_ENABLED') === 'false') {
      return this.cache(key, { result: 'clear', risk_score: 0 });
    }
    const apiKey = this.config.get<string>('TRM_LABS_API_KEY');
    if (!apiKey || apiKey === '...') return this.cache(key, { result: 'review', risk_score: 50 });
    try {
      const response = await fetch('https://api.trmlabs.com/public/v2/screening/addresses', {
        method: 'POST',
        headers: { authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`, 'content-type': 'application/json' },
        body: JSON.stringify([{ address, chain: 'stellar' }]),
        signal: AbortSignal.timeout(2000),
      });
      const payload: any = await response.json();
      const risk = Number(payload?.[0]?.riskScore ?? 0);
      return this.cache(key, { result: risk >= 90 ? 'blocked' : risk >= 50 ? 'review' : 'clear', risk_score: risk });
    } catch {
      return this.cache(key, { result: 'review', risk_score: 50 });
    }
  }

  async checkVelocity(merchantId: string, amountCents: number) {
    const hour = new Date().toISOString().slice(0, 13);
    const key = `velocity:${merchantId}:${hour}`;
    await this.redis.zadd(key, Date.now(), String(amountCents));
    await this.redis.expire(key, 7200);
    const values = await this.redis.zrange(key, 0, -1);
    const total = values.reduce((sum, value) => sum + Number(value), 0);
    return total <= this.config.get<number>('VELOCITY_LIMIT_PER_HOUR_CENTS', 5_000_000);
  }

  async combinedCheck(payment: { payer: string; amountCents: number; merchantId: string }) {
    const [screening, velocityOk] = await Promise.all([
      this.screenAddress(payment.payer),
      this.checkVelocity(payment.merchantId, payment.amountCents),
    ]);
    if (!velocityOk && screening.result === 'clear') return { ...screening, result: 'review' as const };
    return screening;
  }

  private async cache(key: string, result: ScreeningResult) {
    await this.redis.set(key, JSON.stringify(result), 'EX', 3600);
    return result;
  }

  async uploadDocument(merchantId: string, input: unknown) {
    const dto = uploadDocumentSchema.parse(input);
    const s3Key = `kyc/${merchantId}/${Date.now()}-${dto.file_name}`;
    const result = await this.pool.query(
      `INSERT INTO kyc_documents (merchant_id, document_type, file_name, s3_key)
       VALUES ($1,$2,$3,$4) RETURNING id, document_type, file_name, status, uploaded_at`,
      [merchantId, dto.document_type, dto.file_name, s3Key],
    );
    const bucket = this.config.get<string>('KYC_S3_BUCKET', 'stargate-kyc-documents');
    const region = this.config.get<string>('AWS_REGION', 'us-east-1');
    return {
      ...result.rows[0],
      upload_url: `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`,
    };
  }
}
