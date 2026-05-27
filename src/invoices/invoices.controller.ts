import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  create(@Req() req: any, @Body() body: unknown) {
    return this.invoices.create(req.user.merchantId, body);
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
