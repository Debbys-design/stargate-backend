import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { AppModule } from '../../src/app.module';

describe('Concurrent Invoice Muxed ID Allocation (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  let merchantId: string;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const configService = app.get(ConfigService);
    pool = new Pool({
      connectionString: configService.getOrThrow<string>('DATABASE_URL'),
    });
  });

  afterAll(async () => {
    await pool.end();
    await app.close();
  });

  beforeEach(async () => {
    // Register merchant
    const registerRes = await app
      .getHttpServer()
      .post('/auth/register')
      .send({
        email: `merchant-${Date.now()}@test.com`,
        password: 'TestPassword123!',
      });

    merchantId = registerRes.body.merchant_id;

    // Login
    const loginRes = await app
      .getHttpServer()
      .post('/auth/login')
      .send({
        email: registerRes.body.email,
        password: 'TestPassword123!',
      });

    authToken = loginRes.body.access_token;
  });

  afterEach(async () => {
    // Clean up test data
    await pool.query('DELETE FROM invoices WHERE merchant_id = $1', [merchantId]);
    await pool.query('DELETE FROM merchants WHERE id = $1', [merchantId]);
  });

  it('should allocate unique muxed_ids for concurrent invoice creation', async () => {
    const concurrentCount = 50;
    const promises = [];

    // Create 50 invoices concurrently
    for (let i = 0; i < concurrentCount; i++) {
      promises.push(
        app
          .getHttpServer()
          .post('/invoices')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            amount_usdc: '100.00',
            description: `Concurrent invoice ${i}`,
            expires_in_minutes: 60,
          }),
      );
    }

    const responses = await Promise.all(promises);

    // Verify all requests succeeded
    responses.forEach((res) => {
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('muxed_id');
      expect(res.body).toHaveProperty('muxed_address');
    });

    // Extract muxed_ids
    const muxedIds = responses.map((res) => BigInt(res.body.muxed_id));

    // Verify all muxed_ids are unique
    const uniqueMuxedIds = new Set(muxedIds.map((id) => id.toString()));
    expect(uniqueMuxedIds.size).toBe(concurrentCount);

    // Verify all muxed_ids are sequential
    const sortedIds = Array.from(muxedIds).sort((a, b) => (a < b ? -1 : 1));
    for (let i = 1; i < sortedIds.length; i++) {
      expect(sortedIds[i]).toBe(sortedIds[i - 1] + 1n);
    }

    // Verify database consistency
    const dbResult = await pool.query(
      `SELECT muxed_id FROM invoices WHERE merchant_id = $1 ORDER BY muxed_id`,
      [merchantId],
    );

    expect(dbResult.rows.length).toBe(concurrentCount);

    // Verify no duplicate muxed_ids in database
    const dbMuxedIds = dbResult.rows.map((row) => BigInt(row.muxed_id));
    const uniqueDbIds = new Set(dbMuxedIds.map((id) => id.toString()));
    expect(uniqueDbIds.size).toBe(concurrentCount);
  });

  it('should maintain muxed_id uniqueness across multiple merchants', async () => {
    const merchantCount = 5;
    const invoicesPerMerchant = 10;
    const merchants: Array<{ id: string; token: string }> = [];

    // Create multiple merchants
    for (let m = 0; m < merchantCount; m++) {
      const registerRes = await app
        .getHttpServer()
        .post('/auth/register')
        .send({
          email: `merchant-multi-${m}-${Date.now()}@test.com`,
          password: 'TestPassword123!',
        });

      const loginRes = await app
        .getHttpServer()
        .post('/auth/login')
        .send({
          email: registerRes.body.email,
          password: 'TestPassword123!',
        });

      merchants.push({
        id: registerRes.body.merchant_id,
        token: loginRes.body.access_token,
      });
    }

    // Create invoices for each merchant
    const allMuxedIds: Array<{ merchantId: string; muxedId: bigint }> = [];

    for (const merchant of merchants) {
      const promises = [];
      for (let i = 0; i < invoicesPerMerchant; i++) {
        promises.push(
          app
            .getHttpServer()
            .post('/invoices')
            .set('Authorization', `Bearer ${merchant.token}`)
            .send({
              amount_usdc: '50.00',
              description: `Invoice for merchant ${merchant.id}`,
              expires_in_minutes: 60,
            }),
        );
      }

      const responses = await Promise.all(promises);
      responses.forEach((res) => {
        allMuxedIds.push({
          merchantId: merchant.id,
          muxedId: BigInt(res.body.muxed_id),
        });
      });
    }

    // Verify each merchant has unique muxed_ids
    for (const merchant of merchants) {
      const merchantMuxedIds = allMuxedIds
        .filter((m) => m.merchantId === merchant.id)
        .map((m) => m.muxedId);

      const uniqueIds = new Set(merchantMuxedIds.map((id) => id.toString()));
      expect(uniqueIds.size).toBe(invoicesPerMerchant);
    }

    // Verify muxed_ids are globally unique (different merchants have different ranges)
    const globalMuxedIds = allMuxedIds.map((m) => m.muxedId);
    const uniqueGlobalIds = new Set(globalMuxedIds.map((id) => id.toString()));
    expect(uniqueGlobalIds.size).toBe(merchantCount * invoicesPerMerchant);

    // Clean up
    for (const merchant of merchants) {
      await pool.query('DELETE FROM invoices WHERE merchant_id = $1', [merchant.id]);
      await pool.query('DELETE FROM merchants WHERE id = $1', [merchant.id]);
    }
  });

  it('should handle rapid sequential invoice creation without race conditions', async () => {
    const invoiceCount = 100;
    const muxedIds: bigint[] = [];

    // Create invoices sequentially but rapidly
    for (let i = 0; i < invoiceCount; i++) {
      const res = await app
        .getHttpServer()
        .post('/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount_usdc: '25.00',
          description: `Sequential invoice ${i}`,
          expires_in_minutes: 60,
        });

      expect(res.status).toBe(201);
      muxedIds.push(BigInt(res.body.muxed_id));
    }

    // Verify all muxed_ids are unique
    const uniqueIds = new Set(muxedIds.map((id) => id.toString()));
    expect(uniqueIds.size).toBe(invoiceCount);

    // Verify they are sequential
    for (let i = 1; i < muxedIds.length; i++) {
      expect(muxedIds[i]).toBe(muxedIds[i - 1] + 1n);
    }

    // Verify database has all invoices
    const dbResult = await pool.query(
      `SELECT COUNT(*) as count FROM invoices WHERE merchant_id = $1`,
      [merchantId],
    );
    expect(Number(dbResult.rows[0].count)).toBe(invoiceCount);
  });

  it('should verify muxed_id format and merchant base allocation', async () => {
    // Create a few invoices
    const invoiceCount = 5;
    const responses = [];

    for (let i = 0; i < invoiceCount; i++) {
      const res = await app
        .getHttpServer()
        .post('/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount_usdc: '10.00',
          expires_in_minutes: 60,
        });
      responses.push(res);
    }

    // Get merchant muxed_base_id
    const merchantResult = await pool.query(
      `SELECT muxed_base_id FROM merchants WHERE id = $1`,
      [merchantId],
    );
    const muxedBase = BigInt(merchantResult.rows[0].muxed_base_id);

    // Verify each muxed_id = base + sequence
    responses.forEach((res, index) => {
      const muxedId = BigInt(res.body.muxed_id);
      const expectedId = muxedBase + BigInt(index + 1);
      expect(muxedId).toBe(expectedId);
    });

    // Verify muxed_address is valid Stellar address
    responses.forEach((res) => {
      expect(res.body.muxed_address).toMatch(/^G[A-Z2-7]{55}$/);
    });
  });
});
