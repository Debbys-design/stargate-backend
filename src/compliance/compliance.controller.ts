import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ComplianceService } from './compliance.service';

@ApiTags('compliance')
@Controller('compliance')
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Post('screen')
  @ApiOperation({ summary: 'OFAC screen a wallet address' })
  async screen(@Body() body: { address: string }) {
    const screening = await this.compliance.screenAddress(body.address);
    return { result: screening.result };
  }

  @Post('documents')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Upload KYC document' })
  uploadDocument(@Req() req: any, @Body() body: unknown) {
    return this.compliance.uploadDocument(req.user.merchantId, body);
  }
}
