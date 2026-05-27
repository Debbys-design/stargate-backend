import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SchedulesService } from './schedules.service';

@ApiTags('schedules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Post()
  @ApiOperation({ summary: 'Create recurring payment schedule' })
  create(@Req() req: any, @Body() body: unknown) {
    return this.schedules.create(req.user.merchantId, body);
  }

  @Get()
  @ApiOperation({ summary: 'List recurring schedules' })
  list(@Req() req: any) {
    return this.schedules.list(req.user.merchantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get recurring schedule' })
  get(@Req() req: any, @Param('id') id: string) {
    return this.schedules.get(req.user.merchantId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update recurring schedule' })
  update(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    return this.schedules.update(req.user.merchantId, id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel recurring schedule' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.schedules.remove(req.user.merchantId, id);
  }
}
