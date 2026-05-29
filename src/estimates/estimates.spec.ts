import { BadRequestException } from '@nestjs/common';
import { EstimatesService } from './estimates.service';

const mockConfig = { getOrThrow: jest.fn().mockReturnValue('https://soroban-testnet.stellar.org') } as any;

describe('EstimatesService.estimateFee', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('returns fee_stroops and fee_usdc_approx from RPC response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({ result: { minResourceFee: '12345' } }),
    }) as any;

    const service = new EstimatesService(mockConfig);
    const result = await service.estimateFee('AAAAAA==');

    expect(result.fee_stroops).toBe(12345);
    expect(result.fee_usdc_approx).toBe('0.0012345');
    expect(result.operation).toBe('AAAAAA==');
  });

  it('throws BadRequestException when operation is empty', async () => {
    const service = new EstimatesService(mockConfig);
    await expect(service.estimateFee('')).rejects.toThrow(BadRequestException);
  });
});
