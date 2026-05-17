import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post()
  @ApiOperation({ summary: 'Register webhook' })
  create(@Req() req: any, @Body() body: unknown) {
    return this.webhooks.create(req.user.merchantId, body);
  }

  @Get()
  @ApiOperation({ summary: 'List merchant webhooks' })
  list(@Req() req: any) {
    return this.webhooks.list(req.user.merchantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate webhook' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.webhooks.deactivate(req.user.merchantId, id);
  }

  @Get(':id/deliveries')
  @ApiOperation({ summary: 'Webhook delivery history' })
  deliveries(@Req() req: any, @Param('id') id: string) {
    return this.webhooks.deliveries(req.user.merchantId, id);
  }

  @Post('deliveries/:id/retry')
  @ApiOperation({ summary: 'Retry failed delivery' })
  retry(@Req() req: any, @Param('id') id: string) {
    return this.webhooks.retry(req.user.merchantId, id);
  }
}
