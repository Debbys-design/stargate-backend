import { Controller, Get, Param, Query, Sse } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get(':id/prepare-tx')
  @ApiOperation({ summary: 'Build unsigned Stellar payment XDR' })
  prepare(@Param('id') id: string, @Query('payer') payer: string) {
    return this.payments.prepareTx(id, payer);
  }

  @Sse(':id/stream')
  @ApiOperation({ summary: 'Real-time invoice status stream' })
  stream(@Param('id') id: string): Observable<MessageEvent> {
    return this.payments.stream(id);
  }
}
