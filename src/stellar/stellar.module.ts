import { Module } from '@nestjs/common';
import { KmsSignerService } from './kms-signer.service';
import { StellarService } from './stellar.service';

@Module({
  providers: [StellarService, KmsSignerService],
  exports: [StellarService, KmsSignerService],
})
export class StellarModule {}
