import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookDeliveryWorker } from './workers/webhook-delivery.worker';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookDeliveryWorker],
  exports: [WebhooksService],
})
export class WebhooksModule {}
