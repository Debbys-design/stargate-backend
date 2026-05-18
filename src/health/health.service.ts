import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module';
import { REDIS } from '../redis/redis.module';

type CheckStatus = 'up' | 'down' | 'not_configured';

type CheckResult = {
  status: CheckStatus;
  latencyMs: number;
  detail?: string;
};

type HealthStatus = 'ok' | 'degraded';

@Injectable()
export class HealthService {
  private readonly timeoutMs = 3000;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  async getHealth() {
    const checks = {
      database: await this.checkDatabase(),
      redis: await this.checkRedis(),
    };

    return {
      status: this.toHealthStatus(checks),
      version: process.env.npm_package_version ?? '1.0.0',
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  async getDeepHealth() {
    const [base, rpc] = await Promise.all([this.getHealth(), this.getRpcHealth()]);
    const checks = {
      ...base.checks,
      ...rpc.checks,
      queue: {
        status: 'up' as const,
        latencyMs: 0,
        detail: 'webhook retry queue is managed by Redis-backed workers',
      },
    };

    return {
      status: this.toHealthStatus(checks),
      version: base.version,
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  async getRpcHealth() {
    const checks = {
      stellar_horizon: await this.checkHttp('HORIZON_URL'),
      soroban_rpc: await this.checkHttp('SOROBAN_RPC_URL', false),
    };

    return {
      status: this.toHealthStatus(checks),
      version: process.env.npm_package_version ?? '1.0.0',
      timestamp: new Date().toISOString(),
      network: this.config.get<string>('STELLAR_NETWORK', 'testnet'),
      checks,
    };
  }

  private async checkDatabase(): Promise<CheckResult> {
    return this.timed(async () => {
      await this.pool.query('SELECT 1');
      return { status: 'up' as const, detail: 'postgres reachable' };
    });
  }

  private async checkRedis(): Promise<CheckResult> {
    return this.timed(async () => {
      if (this.redis.status === 'wait' || this.redis.status === 'end') {
        await this.redis.connect();
      }
      const pong = await this.redis.ping();
      return { status: pong === 'PONG' ? ('up' as const) : ('down' as const), detail: `redis ${pong}` };
    });
  }

  private async checkHttp(envName: string, required = true): Promise<CheckResult> {
    const url = this.config.get<string>(envName);
    if (!url) {
      return {
        status: required ? 'down' : 'not_configured',
        latencyMs: 0,
        detail: `${envName} is not configured`,
      };
    }

    return this.timed(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(url, { method: 'GET', signal: controller.signal });
        return {
          status: response.ok ? ('up' as const) : ('down' as const),
          detail: `${envName} returned ${response.status}`,
        };
      } finally {
        clearTimeout(timeout);
      }
    });
  }

  private async timed(work: () => Promise<Omit<CheckResult, 'latencyMs'>>): Promise<CheckResult> {
    const started = Date.now();
    let timeout: NodeJS.Timeout | undefined;

    try {
      const result = await Promise.race([
        work(),
        new Promise<Omit<CheckResult, 'latencyMs'>>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('health check timed out')), this.timeoutMs);
        }),
      ]);
      return { ...result, latencyMs: Date.now() - started };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown error';
      return { status: 'down', latencyMs: Date.now() - started, detail };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private toHealthStatus(checks: Record<string, CheckResult>): HealthStatus {
    return Object.values(checks).every((check) => check.status === 'up' || check.status === 'not_configured')
      ? 'ok'
      : 'degraded';
  }
}
