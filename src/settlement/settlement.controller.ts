import { Controller, Get, UseGuards, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { DATABASE_POOL } from '../database/database.module';

@Controller('admin/settlements')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SettlementController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Get('dry-run')
  async dryRun() {
    const result = await this.pool.query(
      `SELECT merchant_id, SUM(net_usdc) AS amount_usdc, COUNT(*) AS entry_count
         FROM ledger_entries
        WHERE settlement_id IS NULL
        GROUP BY merchant_id
       HAVING SUM(net_usdc) >= 1.00
       ORDER BY merchant_id`,
    );
    return {
      preview: result.rows,
      total_merchants: result.rowCount,
      total_amount_usdc: result.rows.reduce((sum, row) => sum + parseFloat(row.amount_usdc), 0),
    };
  }
}
