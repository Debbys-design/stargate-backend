import { Module } from '@nestjs/common';
import { MerchantsModule } from '../merchants/merchants.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [MerchantsModule, WebhooksModule],
  controllers: [AdminController],
})
export class AdminModule {}
