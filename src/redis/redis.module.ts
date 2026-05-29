import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisSubscriptionService } from './redis-subscription.service';

export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis(config.getOrThrow<string>('REDIS_URL'), {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        }),
    },
    RedisSubscriptionService,
  ],
  exports: [REDIS, RedisSubscriptionService],
})
export class RedisModule {}
