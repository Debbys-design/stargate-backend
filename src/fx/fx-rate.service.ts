import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module';

export type SupportedCurrency = 'USDC' | 'EURC' | 'XLM';

// Stellar DEX / Horizon price endpoint for on-chain rates
const HORIZON_URL = process.env.HORIZON_URL ?? 'https://horizon.stellar.org';
const USDC_ISSUER = process.env.STELLAR_ASSET_ISSUER ?? 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const EURC_ISSUER = process.env.EURC_ASSET_ISSUER ?? 'GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP';

@Injectable()
export class FxRateService {
  private readonly logger = new Logger(FxRateService.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  /** Convert an amount in `currency` to its USDC equivalent. */
  async toUsdc(amount: string, currency: SupportedCurrency): Promise<string> {
    if (currency === 'USDC') return amount;
    const rate = await this.getRate(currency);
    const result = (parseFloat(amount) * rate).toFixed(7);
    return result;
  }

  /** Get the USDC rate for a currency (cached in DB, refreshed every 5 min). */
  async getRate(currency: SupportedCurrency): Promise<number> {
    if (currency === 'USDC') return 1;
    const { rows } = await this.pool.query(
      `SELECT rate, fetched_at FROM fx_rates WHERE base_currency=$1 AND quote_currency='USDC'`,
      [currency],
    );
    if (rows[0]) return parseFloat(rows[0].rate);
    return currency === 'EURC' ? 1.08 : 0.11; // fallback
  }

  /** Refresh rates from Stellar Horizon every 5 minutes. */
  @Cron('0 */5 * * * *')
  async refreshRates() {
    await Promise.allSettled([
      this.fetchAndStore('EURC', EURC_ISSUER),
      this.fetchAndStore('XLM', 'native'),
    ]);
  }

  private async fetchAndStore(currency: 'EURC' | 'XLM', issuer: string) {
    try {
      const isNative = issuer === 'native';
      const buyingParam = isNative
        ? 'buying_asset_type=native'
        : `buying_asset_type=credit_alphanum4&buying_asset_code=${currency}&buying_asset_issuer=${issuer}`;
      const url =
        `${HORIZON_URL}/order_book?selling_asset_type=credit_alphanum4` +
        `&selling_asset_code=USDC&selling_asset_issuer=${USDC_ISSUER}` +
        `&${buyingParam}&limit=1`;

      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any = await res.json();
      // bids[0].price = how many of `currency` per 1 USDC → invert for USDC per currency
      const bid = data?.bids?.[0]?.price;
      if (!bid) return;
      const rate = (1 / parseFloat(bid)).toFixed(12);
      await this.pool.query(
        `INSERT INTO fx_rates (base_currency, quote_currency, rate, fetched_at)
         VALUES ($1, 'USDC', $2, NOW())
         ON CONFLICT (base_currency, quote_currency) DO UPDATE
           SET rate=EXCLUDED.rate, fetched_at=EXCLUDED.fetched_at`,
        [currency, rate],
      );
      this.logger.debug(`FX ${currency}/USDC = ${rate}`);
    } catch (err: any) {
      this.logger.warn(`Failed to refresh FX rate for ${currency}: ${err.message}`);
    }
  }
}
