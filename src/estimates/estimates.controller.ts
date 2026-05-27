import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EstimatesService } from './estimates.service';

@ApiTags('estimates')
@Controller('estimates')
export class EstimatesController {
  constructor(private readonly estimates: EstimatesService) {}

  @Get('fee')
  @ApiOperation({ summary: 'Estimate Soroban fee for a given operation XDR' })
  estimateFee(@Query('operation') operation: string) {
    return this.estimates.estimateFee(operation);
  }
}
