import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditLogsService } from './audit-logs.service';

@ApiTags('audit-logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogs: AuditLogsService) {}

  @Get()
  @ApiOperation({ summary: 'List audit log entries for the authenticated merchant' })
  @ApiQuery({ name: 'actor', required: false })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'resource_type', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  list(@Req() req: any, @Query() query: any) {
    return this.auditLogs.list(req.user.merchantId, query);
  }
}
