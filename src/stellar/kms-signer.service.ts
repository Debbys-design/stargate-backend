import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KMSClient, SignCommand } from '@aws-sdk/client-kms';

@Injectable()
export class KmsSignerService {
  private readonly kms: KMSClient;

  constructor(private readonly config: ConfigService) {
    this.kms = new KMSClient({ region: config.get<string>('AWS_REGION', 'us-east-1') });
  }

  async signDigest(digest: Uint8Array) {
    const keyId = this.config.getOrThrow<string>('AWS_KMS_KEY_ID');
    const response = await this.kms.send(
      new SignCommand({
        KeyId: keyId,
        Message: digest,
        MessageType: 'DIGEST',
        SigningAlgorithm: 'ECDSA_SHA_256',
      }),
    );
    if (!response.Signature) throw new Error('KMS did not return a signature');
    return response.Signature;
  }
}
