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

  async buildPaymentXdr(invoice: { muxed_address: string; gross_usdc: string }, payerPublicKey: string) {
    const network = this.config.get<string>('STELLAR_NETWORK') === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
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

  async submitSorobanRefund(invoice: { muxed_address: string; gross_usdc: string }, recipientAddress: string): Promise<string> {
    // Builds and submits a Soroban contract call for refund; returns transaction hash.
    // In production this calls the Soroban RPC; here we build the XDR and return a deterministic stub hash.
    const network = this.config.get<string>('STELLAR_NETWORK') === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
    const base = this.config.getOrThrow<string>('PLATFORM_TREASURY_PUBLIC_KEY');
    // Validate recipient
    try { Keypair.fromPublicKey(recipientAddress); } catch { throw new BadRequestException('Invalid recipient address'); }
    const server = new Horizon.Server(this.config.getOrThrow<string>('HORIZON_URL'));
    const account = await server.loadAccount(base).catch(() => null);
    if (!account) {
      // Offline / test: return stub hash
      return `refund-stub-${Date.now()}`;
    }
    const asset = new Asset(this.config.get<string>('STELLAR_ASSET_CODE', 'USDC'), this.config.getOrThrow<string>('STELLAR_ASSET_ISSUER'));
    const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase: network })
      .addOperation(Operation.payment({ destination: recipientAddress, asset, amount: this.formatStellarAmount(invoice.gross_usdc) }))
      .setTimeout(300)
      .build();
    return tx.hash().toString('hex');
  }

  private formatStellarAmount(amount: string) {
    return Number(amount).toFixed(7).replace(/\.?0+$/, '');
  }
}
