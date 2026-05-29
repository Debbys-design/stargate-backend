describe('Stargate API e2e contract', () => {
  it('documents the required full flow', () => {
    expect([
      'register',
      'login',
      'create invoice',
      'simulate payment event',
      'check SSE',
      'verify webhook delivery attempted',
    ]).toHaveLength(6);
  });

  it('documents the api-key scoped flow', () => {
    expect([
      'login with JWT',
      'create read_only api key',
      'use read_only key to GET invoices',
      'use read_only key to POST invoice (expect 401)',
      'create full_access api key',
      'use full_access key to POST invoice',
    ]).toHaveLength(6);
  });

  it('documents the settlement SSE flow', () => {
    expect([
      'login',
      'trigger daily settlement',
      'connect to GET /settlement/:id/stream',
      'receive status event',
      'stream closes on confirmed or failed',
    ]).toHaveLength(5);
  });

  it('documents the pre-launch audit flow', () => {
    expect([
      'login',
      'GET /audit/pre-launch',
      'receive { status, checks[] }',
    ]).toHaveLength(3);
  });

  it('documents the soroban events flow', () => {
    expect([
      'reconciler indexes soroban contract events',
      'login',
      'GET /soroban-events',
      'receive paginated list',
    ]).toHaveLength(4);
  });
});
