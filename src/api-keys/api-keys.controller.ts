import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiKeysService } from './api-keys.service';

@ApiTags('api-keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Post()
  @ApiOperation({ summary: 'Create a scoped API key (read_only | webhooks | full_access)' })
  create(@Req() req: any, @Body() body: unknown) {
    return this.apiKeys.create(req.user.merchantId, body);
  }

  @Get()
  @ApiOperation({ summary: 'List active API keys' })
  list(@Req() req: any) {
    return this.apiKeys.list(req.user.merchantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke an API key' })
  revoke(@Req() req: any, @Param('id') id: string) {
    return this.apiKeys.revoke(req.user.merchantId, id);
  }
}
