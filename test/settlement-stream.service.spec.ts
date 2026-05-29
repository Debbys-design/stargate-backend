import { NotFoundException } from '@nestjs/common';
import { SettlementStreamService } from '../src/settlement/settlement-stream.service';

const mockRedis = {
  duplicate: jest.fn(),
};
const mockPool = { query: jest.fn() };

describe('SettlementStreamService', () => {
  let service: SettlementStreamService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SettlementStreamService(mockRedis as any, mockPool as any);
  });

  it('errors with NotFoundException when settlement not found', (done) => {
    const sub = { subscribe: jest.fn().mockResolvedValue(undefined), on: jest.fn(), disconnect: jest.fn() };
    mockRedis.duplicate.mockReturnValue(sub);
    mockPool.query.mockResolvedValue({ rows: [] });

    service.streamSettlement('merchant-1', 'bad-id').subscribe({
      error: (err: unknown) => {
        expect(err).toBeInstanceOf(NotFoundException);
        done();
      },
    });
  });

  it('completes immediately when settlement is already confirmed', (done) => {
    const sub = { subscribe: jest.fn(), on: jest.fn(), disconnect: jest.fn() };
    mockRedis.duplicate.mockReturnValue(sub);
    mockPool.query.mockResolvedValue({
      rows: [{ id: 'sid', status: 'confirmed', amount_usdc: '100', tx_hash: 'abc', settled_at: new Date() }],
    });

    const events: any[] = [];
    service.streamSettlement('merchant-1', 'sid').subscribe({
      next: (e: MessageEvent) => events.push(e),
      complete: () => {
        expect(events[0].data.status).toBe('confirmed');
        done();
      },
    });
  });
});
