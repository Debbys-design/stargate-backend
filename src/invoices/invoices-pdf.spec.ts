import { InvoicesService } from './invoices.service';

describe('InvoicesService.generatePdf', () => {
  it('returns a readable stream that emits data', async () => {
    const mockInvoice = {
      id: 'inv-1',
      status: 'paid',
      amount_usdc: '10.0000000',
      fee_usdc: '0.2500000',
      net_usdc: '9.7500000',
      description: 'Test',
      created_at: new Date().toISOString(),
      paid_at: new Date().toISOString(),
      payment_events: [],
    };
    const mockMerchant = { name: 'Acme Corp' };

    const service = {
      get: jest.fn().mockResolvedValue(mockInvoice),
      merchants: { findOne: jest.fn().mockResolvedValue(mockMerchant) },
    } as unknown as InvoicesService;

    // Call the real generatePdf via prototype binding
    const stream = await InvoicesService.prototype.generatePdf.call(service, 'merchant-1', 'inv-1');
    await new Promise<void>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => {
        const pdf = Buffer.concat(chunks);
        expect(pdf.slice(0, 4).toString()).toBe('%PDF');
        resolve();
      });
      stream.on('error', reject);
    });
  });
});
