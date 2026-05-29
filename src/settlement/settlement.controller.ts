import { Controller, Param, Req, Sse, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SettlementStreamService } from './settlement-stream.service';

@ApiTags('settlement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('settlement')
export class SettlementController {
  constructor(private readonly settlementStream: SettlementStreamService) {}

  @Sse(':id/stream')
  @ApiOperation({ summary: 'Stream settlement status updates via Server-Sent Events' })
  streamStatus(@Req() req: any, @Param('id') id: string): Observable<MessageEvent> {
    return this.settlementStream.streamSettlement(req.user.merchantId, id);
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
