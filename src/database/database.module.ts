import { Global, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { runMigrations } from './migrator';

export const DATABASE_POOL = Symbol('DATABASE_POOL');

@Injectable()
export class DatabaseBootstrap implements OnModuleInit {
  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    if (process.env.RUN_MIGRATIONS_ON_STARTUP === 'false') return;
    const pool = new Pool({ connectionString: this.config.getOrThrow<string>('DATABASE_URL') });
    try {
      await runMigrations(pool);
    } finally {
      await pool.end();
    }
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new Pool({ connectionString: config.getOrThrow<string>('DATABASE_URL') }),
    },
    DatabaseBootstrap,
  ],
  exports: [DATABASE_POOL],
})
export class DatabaseModule {}
