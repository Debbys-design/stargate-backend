import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { KmsSignerService } from '../stellar/kms-signer.service';

@ApiTags('treasury')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('treasury')
export class TreasuryController {
  constructor(private readonly kms: KmsSignerService) {}

  @Post('sign')
  @ApiOperation({ summary: 'Submit treasury approval digest for KMS signing' })
  async sign(@Body() body: { digest: string }) {
    if (!body?.digest) throw new BadRequestException('digest is required');
    const bytes = Buffer.from(body.digest, 'hex');
    if (bytes.length !== 32) throw new BadRequestException('digest must be a 32-byte hex string');
    const signature = await this.kms.signDigest(bytes);
    return { signature: Buffer.from(signature).toString('hex') };
  }
}
