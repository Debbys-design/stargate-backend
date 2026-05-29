import { Body, Controller, Headers, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DisputesService } from './disputes.service';

@ApiTags('disputes')
@Controller('disputes')
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a chargeback dispute' })
  @ApiHeader({ name: 'Idempotency-Key', description: 'Optional idempotency key to prevent duplicate creation', required: false })
  create(@Req() req: any, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey?: string) {
    const merchantId = req.user.merchantId;
    return this.disputes.create(merchantId, body, idempotencyKey);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update dispute status' })
  patch(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    return this.disputes.patch(req.user.merchantId, id, body);
  }
}

