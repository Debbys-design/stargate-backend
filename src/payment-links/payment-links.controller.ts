import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentLinksService } from './payment-links.service';

@ApiTags('payment-links')
@Controller('payment-links')
export class PaymentLinksController {
  constructor(private readonly paymentLinks: PaymentLinksService) {}

  /** Public — called by the payment page frontend on load */
  @Post(':invoiceId/view')
  @ApiOperation({ summary: 'Track a payment link view (public)' })
  trackView(@Param('invoiceId') invoiceId: string, @Req() req: any) {
    const ipHash = this.hashIp(req.ip);
    const userAgent = req.headers['user-agent'] ?? null;
    return this.paymentLinks.trackEvent(invoiceId, 'view', { ipHash, userAgent });
  }

  /** Public — called when the user initiates a payment attempt */
  @Post(':invoiceId/attempt')
  @ApiOperation({ summary: 'Track a payment attempt (public)' })
  trackAttempt(@Param('invoiceId') invoiceId: string, @Req() req: any) {
    const ipHash = this.hashIp(req.ip);
    const userAgent = req.headers['user-agent'] ?? null;
    return this.paymentLinks.trackEvent(invoiceId, 'attempt', { ipHash, userAgent });
  }

  /** Authenticated — analytics per invoice */
  @Get(':invoiceId/analytics')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get analytics for a single payment link' })
  getAnalytics(@Req() req: any, @Param('invoiceId') invoiceId: string) {
    return this.paymentLinks.getAnalytics(req.user.merchantId, invoiceId);
  }

  /** Authenticated — analytics across all payment links */
  @Get('analytics')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List analytics for all payment links' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listAnalytics(@Req() req: any, @Query() query: any) {
    return this.paymentLinks.listAnalytics(req.user.merchantId, query);
  }

  private hashIp(ip: string | undefined): string | undefined {
    if (!ip) return undefined;
    const { createHash } = require('node:crypto');
    return createHash('sha256').update(ip).digest('hex');
  }
}
