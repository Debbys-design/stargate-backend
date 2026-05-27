import { Module } from '@nestjs/common';
import { StellarModule } from '../stellar/stellar.module';
import { TreasuryController } from './treasury.controller';

@Module({
  imports: [StellarModule],
  controllers: [TreasuryController],
})
export class TreasuryModule {}
