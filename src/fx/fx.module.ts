import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { FxRateService } from './fx-rate.service';

@Module({
  imports: [DatabaseModule],
  providers: [FxRateService],
  exports: [FxRateService],
})
export class FxModule {}
