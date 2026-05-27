import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { Observable } from 'rxjs';
import { InvoicesService } from '../invoices/invoices.service';
import { REDIS } from '../redis/redis.module';
import { StellarService } from '../stellar/stellar.service';

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly invoices: InvoicesService,
    private readonly stellar: StellarService,
  ) {}

  async prepareTx(id: string, payer?: string) {
    if (!payer) throw new BadRequestException('payer query parameter is required');
    const invoice = await this.invoices.getPublic(id);
    return { xdr: await this.stellar.buildPaymentXdr(invoice, payer, invoice.test_mode), network: invoice.test_mode ? 'testnet' : (process.env.STELLAR_NETWORK ?? 'testnet') };
  }

  stream(invoiceId: string) {
    return new Observable<MessageEvent>((subscriber) => {
      const redis = this.redis.duplicate();
      const heartbeat = setInterval(() => subscriber.next({ data: { type: 'heartbeat' } } as MessageEvent), 15_000);
      redis.subscribe(`invoice:${invoiceId}`).then(() => undefined);
      redis.on('message', (_channel, message) => {
        try {
          const data = JSON.parse(message);
          subscriber.next({ data } as MessageEvent);
          if (data.status === 'paid' || data.status === 'expired') subscriber.complete();
        } catch {
          // Ignore malformed messages, continue streaming
        }
      });
      return () => {
        clearInterval(heartbeat);
        redis.disconnect();
      };
    });
  }
}
