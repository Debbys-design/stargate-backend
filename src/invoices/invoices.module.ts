import { Module } from '@nestjs/common';
import { ComplianceModule } from '../compliance/compliance.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { MerchantsModule } from '../merchants/merchants.module';
import { StellarModule } from '../stellar/stellar.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [MerchantsModule, StellarModule, ComplianceModule, WebhooksModule],
  imports: [MerchantsModule, StellarModule, ComplianceModule, IdempotencyModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
