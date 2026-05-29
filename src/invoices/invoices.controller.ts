import { Body, Controller, Get, Header, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InvoicesService } from './invoices.service';

@ApiTags('invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post('bulk')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Bulk create up to 100 invoices atomically' })
  bulk(@Req() req: any, @Body() body: unknown[]) {
    return this.invoices.createBulk(req.user.merchantId, body);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create invoice' })
  @ApiHeader({ name: 'Idempotency-Key', description: 'Optional idempotency key to prevent duplicate creation', required: false })
  create(
    @Req() req: any,
    @Body() body: unknown,
    @Res({ passthrough: true }) _res: Response,
  ) {
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

  @Post(':id/refund')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Initiate Soroban-settled refund' })
  refund(@Req() req: any, @Param('id') id: string) {
    return this.invoices.refund(req.user.merchantId, id);
  }

  @Get(':id/pdf')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Header('Content-Type', 'application/pdf')
  @ApiOperation({ summary: 'Download invoice PDF receipt' })
  async pdf(@Req() req: any, @Param('id') id: string, @Res() res: Response) {
    const stream = await this.invoices.generatePdf(req.user.merchantId, id);
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${id}.pdf"`);
    stream.pipe(res);
  }

  @Post(':id/cancel')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Cancel pending invoice' })
  cancel(@Req() req: any, @Param('id') id: string) {
    return this.invoices.cancel(req.user.merchantId, id);
  }
}
