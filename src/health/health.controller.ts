import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async getHealth() {
    const result = await this.health.getHealth();
    if (result.status !== 'ok') throw new ServiceUnavailableException(result);
    return result;
  }

  @Get('deep')
  async getDeepHealth() {
    const result = await this.health.getDeepHealth();
    if (result.status !== 'ok') throw new ServiceUnavailableException(result);
    return result;
  }

  @Get('rpc')
  async getRpcHealth() {
    const result = await this.health.getRpcHealth();
    if (result.status !== 'ok') throw new ServiceUnavailableException(result);
    return result;
  }
}
