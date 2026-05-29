import { SorobanEventsService } from '../src/soroban-events/soroban-events.service';

const mockPool = { query: jest.fn() };

describe('SorobanEventsService', () => {
  let service: SorobanEventsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SorobanEventsService(mockPool as any);
    mockPool.query.mockResolvedValue({ rows: [] });
  });

  it('queries by merchant_id', async () => {
    await service.list('merchant-1', {});
    expect(mockPool.query.mock.calls[0][1][0]).toBe('merchant-1');
  });

  it('applies contract_id filter when provided', async () => {
    await service.list('merchant-1', { contract_id: 'CABC' });
    expect(mockPool.query.mock.calls[0][0]).toContain('contract_id=$4');
    expect(mockPool.query.mock.calls[0][1][3]).toBe('CABC');
  });

  it('returns empty list with zero total when no rows', async () => {
    const result = await service.list('merchant-1', {});
    expect(result).toEqual({ page: 1, limit: 20, total: 0, items: [] });
  });

  it('clamps limit to 100', async () => {
    await service.list('merchant-1', { limit: '999' });
    expect(mockPool.query.mock.calls[0][1][1]).toBe(100);
  });
});
