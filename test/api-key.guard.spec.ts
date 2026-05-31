import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyGuard, REQUIRED_SCOPE_KEY } from '../src/api-keys/api-key.guard';

const mockApiKeysService = { validate: jest.fn() };
const mockReflector = { get: jest.fn() };

function makeContext(authHeader: string, handler = () => {}) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: authHeader }, user: undefined as any }) }),
    getHandler: () => handler,
  } as any;
}

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new ApiKeyGuard(mockApiKeysService as any, mockReflector as any);
  });

  it('throws when no Authorization header', async () => {
    await expect(guard.canActivate(makeContext(''))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws when header is not a sk_ key', async () => {
    await expect(guard.canActivate(makeContext('Bearer eyJhbGc...'))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows read_only key on endpoint requiring read_only', async () => {
    mockApiKeysService.validate.mockResolvedValue({ merchantId: 'mid', scope: 'read_only' });
    mockReflector.get.mockReturnValue('read_only');
    const ctx = makeContext('Bearer sk_abc');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects read_only key on endpoint requiring full_access', async () => {
    mockApiKeysService.validate.mockResolvedValue({ merchantId: 'mid', scope: 'read_only' });
    mockReflector.get.mockReturnValue('full_access');
    await expect(guard.canActivate(makeContext('Bearer sk_abc'))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows full_access key on any scope', async () => {
    mockApiKeysService.validate.mockResolvedValue({ merchantId: 'mid', scope: 'full_access' });
    mockReflector.get.mockReturnValue('webhooks');
    await expect(guard.canActivate(makeContext('Bearer sk_abc'))).resolves.toBe(true);
  });
});
