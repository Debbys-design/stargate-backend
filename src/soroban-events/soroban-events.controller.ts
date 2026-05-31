import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SorobanEventsService } from './soroban-events.service';

@ApiTags('soroban-events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('soroban-events')
export class SorobanEventsController {
  constructor(private readonly sorobanEvents: SorobanEventsService) {}

  @Get()
  @ApiOperation({ summary: 'List indexed Soroban contract events for the merchant' })
  list(@Req() req: any, @Query() query: any) {
    return this.sorobanEvents.list(req.user.merchantId, query);
  }
}
