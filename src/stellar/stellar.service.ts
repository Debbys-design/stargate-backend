import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Account, Asset, Horizon, Keypair, MuxedAccount, Networks, Operation, TransactionBuilder } from 'stellar-sdk';

@Injectable()
export class StellarService {
  constructor(private readonly config: ConfigService) {}

  buildMuxedAddress(muxedId: string | number | bigint) {
    const base = this.config.getOrThrow<string>('PLATFORM_TREASURY_PUBLIC_KEY');
    const account = new MuxedAccount(new Account(base, '0'), String(muxedId));
    return account.accountId();
  }

  async buildPaymentXdr(invoice: { muxed_address: string; gross_usdc: string }, payerPublicKey: string, testMode?: boolean) {
    const networkEnv = this.config.get<string>('STELLAR_NETWORK') === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
    const network = testMode === true ? Networks.TESTNET : testMode === false ? Networks.PUBLIC : networkEnv;
    try {
      Keypair.fromPublicKey(payerPublicKey);
    } catch {
      throw new BadRequestException('Invalid payer public key');
    }
    const server = new Horizon.Server(this.config.getOrThrow<string>('HORIZON_URL'));
    const account = await server.loadAccount(payerPublicKey);
    const asset = new Asset(this.config.get<string>('STELLAR_ASSET_CODE', 'USDC'), this.config.getOrThrow<string>('STELLAR_ASSET_ISSUER'));
    const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase: network })
      .addOperation(Operation.payment({ destination: invoice.muxed_address, asset, amount: this.formatStellarAmount(invoice.gross_usdc) }))
      .setTimeout(300)
      .build();
    return tx.toXDR();
  }

  private formatStellarAmount(amount: string) {
    return Number(amount).toFixed(7).replace(/\.?0+$/, '');
  }
}
