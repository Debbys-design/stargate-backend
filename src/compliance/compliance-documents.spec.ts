import { ComplianceService } from './compliance.service';

describe('ComplianceService.uploadDocument', () => {
  const mockRow = { id: 'doc-1', document_type: 'passport', file_name: 'passport.jpg', status: 'pending', uploaded_at: new Date().toISOString() };
  const pool = { query: jest.fn().mockResolvedValue({ rows: [mockRow] }) } as any;
  const redis = { get: jest.fn(), set: jest.fn() } as any;
  const config = { get: jest.fn((key: string, def: string) => def), getOrThrow: jest.fn() } as any;

  const service = new ComplianceService(redis, config, pool);

  it('inserts a kyc_documents row and returns upload_url', async () => {
    const result = await service.uploadDocument('mer-1', { document_type: 'passport', file_name: 'passport.jpg' });
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO kyc_documents'), expect.arrayContaining(['mer-1', 'passport', 'passport.jpg']));
    expect(result.upload_url).toMatch(/^https:\/\/.+\.s3\..+\.amazonaws\.com\/kyc\/mer-1\//);
    expect(result.id).toBe('doc-1');
  });

  it('rejects invalid document_type', async () => {
    await expect(service.uploadDocument('mer-1', { document_type: 'selfie', file_name: 'me.jpg' })).rejects.toThrow();
  });
});
