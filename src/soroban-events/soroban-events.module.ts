import { Module } from '@nestjs/common';
import { SorobanEventsController } from './soroban-events.controller';
import { SorobanEventsService } from './soroban-events.service';

@Module({
  controllers: [SorobanEventsController],
  providers: [SorobanEventsService],
})
export class SorobanEventsModule {}
