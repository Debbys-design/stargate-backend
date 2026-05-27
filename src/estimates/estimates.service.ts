import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EstimatesService {
  constructor(private readonly config: ConfigService) {}

  async estimateFee(operation: string): Promise<{ operation: string; fee_stroops: number; fee_usdc_approx: string }> {
    if (!operation) throw new BadRequestException('operation query parameter is required');
    const rpcUrl = this.config.getOrThrow<string>('SOROBAN_RPC_URL');
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'simulateTransaction', params: { transaction: operation } }),
      signal: AbortSignal.timeout(5000),
    });
    const json: any = await response.json();
    const fee = Number(json?.result?.minResourceFee ?? json?.result?.cost?.cpuInsns ?? 0);
    // 1 stroop = 0.0000001 XLM; approximate USDC at 1:1 for display
    const feeUsdc = (fee / 10_000_000).toFixed(7);
    return { operation, fee_stroops: fee, fee_usdc_approx: feeUsdc };
  }
}
