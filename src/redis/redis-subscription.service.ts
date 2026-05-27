import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { Subject } from 'rxjs';
import { REDIS } from './redis.module';

interface ChannelSubscriber {
  subject: Subject<string>;
  count: number;
}

@Injectable()
export class RedisSubscriptionService implements OnModuleDestroy {
  private subscriptionClient: Redis | null = null;
  private channels = new Map<string, ChannelSubscriber>();

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  subscribe(channel: string): Subject<string> {
    if (!this.channels.has(channel)) {
      this.ensureSubscriptionClient();
      this.subscriptionClient!.subscribe(channel);
      this.channels.set(channel, {
        subject: new Subject<string>(),
        count: 0,
      });
    }

    const subscriber = this.channels.get(channel)!;
    subscriber.count++;
    return subscriber.subject;
  }

  unsubscribe(channel: string) {
    const subscriber = this.channels.get(channel);
    if (!subscriber) return;

    subscriber.count--;
    if (subscriber.count <= 0) {
      this.subscriptionClient?.unsubscribe(channel);
      this.channels.delete(channel);
    }
  }

  private ensureSubscriptionClient() {
    if (this.subscriptionClient) return;

    this.subscriptionClient = this.redis.duplicate();
    this.subscriptionClient.on('message', (channel, message) => {
      const subscriber = this.channels.get(channel);
      if (subscriber) {
        subscriber.subject.next(message);
      }
    });
  }

  async onModuleDestroy() {
    if (this.subscriptionClient) {
      await this.subscriptionClient.disconnect();
    }
  }
}
