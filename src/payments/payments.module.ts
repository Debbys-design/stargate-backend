import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { StellarModule } from '../stellar/stellar.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [InvoicesModule, StellarModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
