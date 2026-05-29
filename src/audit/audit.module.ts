import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

@Module({
  controllers: [AuditController],
  providers: [AuditService],
import { AuditService } from './audit.service';

@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
