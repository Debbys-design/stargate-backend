import { Module } from '@nestjs/common';
import { StellarModule } from '../stellar/stellar.module';
import { SettlementController } from './settlement.controller';
import { SettlementStreamService } from './settlement-stream.service';
import { SettlementService } from './settlement.service';
import { SettlementWorker } from './workers/settlement.worker';
import { SettlementController } from './settlement.controller';

@Module({
  imports: [StellarModule],
  controllers: [SettlementController],
  providers: [SettlementService, SettlementStreamService, SettlementWorker],
  providers: [SettlementService, SettlementWorker],
  controllers: [SettlementController],
  exports: [SettlementService],
})
export class SettlementModule {}
