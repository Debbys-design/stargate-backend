import { Module } from '@nestjs/common';
import { StellarModule } from '../stellar/stellar.module';
import { SettlementService } from './settlement.service';
import { SettlementWorker } from './workers/settlement.worker';

@Module({
  imports: [StellarModule],
  providers: [SettlementService, SettlementWorker],
  exports: [SettlementService],
})
export class SettlementModule {}
