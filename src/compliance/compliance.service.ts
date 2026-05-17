import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';

export type ScreeningResult = { result: 'clear' | 'blocked' | 'review'; risk_score: number };

@Injectable()
export class ComplianceService {
  constructor(@Inject(REDIS) private readonly redis: Redis, private readonly config: ConfigService) {}

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
}
