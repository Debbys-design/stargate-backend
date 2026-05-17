import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
}
