import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ApiKeysService } from '../src/api-keys/api-keys.service';

const mockPool = { query: jest.fn() };

describe('ApiKeysService', () => {
  let service: ApiKeysService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ApiKeysService(mockPool as any);
  });

  it('create returns the raw key once', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ id: 'uuid', name: 'test', key_prefix: 'sk_xxxxxxxx', scope: 'read_only', expires_at: null, created_at: new Date() }],
    });
    const result = await service.create('merchant-1', { name: 'test', scope: 'read_only' });
    expect(result.key).toMatch(/^sk_/);
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });

  it('list queries only non-revoked keys', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });
    await service.list('merchant-1');
    expect(mockPool.query.mock.calls[0][0]).toContain('revoked_at IS NULL');
  });

  it('revoke returns null when key not found', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });
    const result = await service.revoke('merchant-1', 'bad-id');
    expect(result).toBeNull();
  });

  it('validate throws on unknown key', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });
    await expect(service.validate('sk_unknown')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('validate returns merchantId and scope on valid key', async () => {
    mockPool.query.mockResolvedValue({ rows: [{ merchant_id: 'mid', scope: 'full_access' }] });
    const result = await service.validate('sk_somekey');
    expect(result).toEqual({ merchantId: 'mid', scope: 'full_access' });
    const hash = createHash('sha256').update('sk_somekey').digest('hex');
    expect(mockPool.query.mock.calls[0][1][0]).toBe(hash);
  });
});
