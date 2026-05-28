import { Module } from '@nestjs/common';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';
import { DatabaseModule } from '../database/database.module';
import { MerchantsService } from '../merchants/merchants.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { StellarModule } from '../stellar/stellar.module';

@Module({
  imports: [DatabaseModule, StellarModule],
  controllers: [DisputesController],
  providers: [DisputesService, MerchantsService, WebhooksService, IdempotencyService],
  exports: [DisputesService],
})
export class DisputesModule {}

