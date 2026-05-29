import { AuditService } from '../src/audit/audit.service';

const mockConfig = { get: jest.fn((key: string, def: string) => def) };

describe('AuditService env checks', () => {
  let service: AuditService;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    service = new AuditService(mockConfig as any);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('fails when NODE_ENV is not set', async () => {
    delete process.env['NODE_ENV'];
    // Access private method via cast
    const checks = (service as any).checkEnvVars() as Array<{ name: string; status: string }>;
    const nodeEnvCheck = checks.find((c) => c.name === 'env:NODE_ENV');
    expect(nodeEnvCheck?.status).toBe('fail');
  });

  it('fails when NODE_ENV is not production', async () => {
    process.env['NODE_ENV'] = 'development';
    const checks = (service as any).checkEnvVars() as Array<{ name: string; status: string }>;
    const nodeEnvCheck = checks.find((c) => c.name === 'env:NODE_ENV');
    expect(nodeEnvCheck?.status).toBe('fail');
  });

  it('passes when all required env vars are set correctly', () => {
    const required: Record<string, string> = {
      NODE_ENV: 'production',
      STELLAR_NETWORK: 'mainnet',
      RUN_MIGRATIONS_ON_STARTUP: 'false',
      DATABASE_URL: 'postgres://x',
      DATABASE_DIRECT_URL: 'postgres://x',
      REDIS_URL: 'redis://x',
      JWT_SECRET: 'secret',
      WEBHOOK_SIGNING_SECRET: 'secret',
      ENCRYPTION_KEY: 'key',
      HORIZON_URL: 'https://horizon.stellar.org',
      SOROBAN_RPC_URL: 'https://soroban.stellar.org',
      STELLAR_ASSET_ISSUER: 'GABC',
      PLATFORM_TREASURY_PUBLIC_KEY: 'GABC',
      INVOICE_CONTRACT_ID: 'CABC',
    };
    Object.assign(process.env, required);
    const checks = (service as any).checkEnvVars() as Array<{ name: string; status: string }>;
    expect(checks.every((c) => c.status === 'pass')).toBe(true);
  });
});
