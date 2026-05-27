import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InvoicesService } from './invoices.service';

@ApiTags('invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create invoice' })
  @ApiHeader({ name: 'Idempotency-Key', description: 'Optional idempotency key to prevent duplicate creation', required: false })
  create(
    @Req() req: any,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
  create(@Req() req: any, @Body() body: unknown) {
    const idempotencyKey = req.headers['idempotency-key'];
    return this.invoices.create(req.user.merchantId, body, idempotencyKey);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List invoices' })
  list(@Req() req: any, @Query() query: any) {
    return this.invoices.list(req.user.merchantId, query);
  }

  @Get('public/:id')
  @ApiOperation({ summary: 'Public invoice for payment page' })
  publicInvoice(@Param('id') id: string) {
    return this.invoices.getPublic(id);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Invoice detail' })
  get(@Req() req: any, @Param('id') id: string) {
    return this.invoices.get(req.user.merchantId, id);
  }

  @Post(':id/cancel')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Cancel pending invoice' })
  cancel(@Req() req: any, @Param('id') id: string) {
    return this.invoices.cancel(req.user.merchantId, id);
  }
}
