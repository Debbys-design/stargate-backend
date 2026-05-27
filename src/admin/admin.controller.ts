import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MerchantsService } from '../merchants/merchants.service';
import { WebhooksService } from '../webhooks/webhooks.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/merchants')
export class AdminController {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly webhooks: WebhooksService,
  ) {}

  @Post(':id/kyc/approve')
  @ApiOperation({ summary: 'Approve merchant KYC' })
  async approveKyc(@Param('id') id: string) {
    const merchant = await this.merchants.updateKycStatus(id, 'approved');
    await this.webhooks.emitKycEvent(id, 'approved');
    return merchant;
  }

  @Post(':id/kyc/reject')
  @ApiOperation({ summary: 'Reject merchant KYC' })
  async rejectKyc(@Param('id') id: string, @Body() body: { reason?: string }) {
    const merchant = await this.merchants.updateKycStatus(id, 'rejected');
    await this.webhooks.emitKycEvent(id, 'rejected');
    return { ...merchant, reason: body.reason };
  }
}
