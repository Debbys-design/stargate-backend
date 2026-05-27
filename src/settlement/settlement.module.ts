import { Module } from '@nestjs/common';
import { StellarModule } from '../stellar/stellar.module';
import { SettlementService } from './settlement.service';
import { SettlementWorker } from './workers/settlement.worker';
import { SettlementController } from './settlement.controller';

@Module({
  imports: [StellarModule],
  providers: [SettlementService, SettlementWorker],
  controllers: [SettlementController],
  exports: [SettlementService],
})
export class SettlementModule {}
