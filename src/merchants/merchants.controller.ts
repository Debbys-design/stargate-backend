import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MerchantsService } from './merchants.service';

@ApiTags('merchants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('merchants')
export class MerchantsController {
  constructor(private readonly merchants: MerchantsService) {}

  @Get('me/onboarding')
  @ApiOperation({ summary: 'Merchant onboarding steps and completion status' })
  onboarding(@Req() req: any) {
    return this.merchants.onboarding(req.user.merchantId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Current merchant profile' })
  me(@Req() req: any) {
    return this.merchants.findOne(req.user.merchantId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update merchant profile' })
  update(@Req() req: any, @Body() body: unknown) {
    return this.merchants.update(req.user.merchantId, body);
  }
}
