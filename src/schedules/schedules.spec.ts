import { NotFoundException } from '@nestjs/common';
import { SchedulesService } from './schedules.service';

function makePool(rows: any[] = []) {
  return { query: jest.fn().mockResolvedValue({ rows, rowCount: rows.length }) };
}

const merchantId = 'merchant-1';
const id = 'sched-1';

describe('SchedulesService', () => {
  it('creates a schedule', async () => {
    const row = { id, merchant_id: merchantId, recipient: 'GABC', amount_usdc: '50.0000000', interval: 'monthly' };
    const pool = makePool([row]);
    const svc = new SchedulesService(pool as any);
    const result = await svc.create(merchantId, { recipient: 'GABC', amount_usdc: 50, interval: 'monthly' });
    expect(result).toEqual(row);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('lists schedules', async () => {
    const rows = [{ id }];
    const pool = makePool(rows);
    const svc = new SchedulesService(pool as any);
    expect(await svc.list(merchantId)).toEqual(rows);
  });

  it('throws NotFoundException when schedule missing', async () => {
    const pool = makePool([]);
    const svc = new SchedulesService(pool as any);
    await expect(svc.get(merchantId, id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cancels a schedule', async () => {
    const row = { id, status: 'cancelled' };
    const pool = makePool([row]);
    const svc = new SchedulesService(pool as any);
    expect(await svc.remove(merchantId, id)).toEqual(row);
  });
});
