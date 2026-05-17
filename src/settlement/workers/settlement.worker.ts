import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SettlementService } from '../settlement.service';

@Injectable()
export class SettlementWorker {
  constructor(private readonly settlement: SettlementService) {}

  @Cron('0 0 * * *')
  runDailySettlement() {
    return this.settlement.createDailySettlements();
  }
}
