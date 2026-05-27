import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { ComplianceModule } from './compliance/compliance.module';
import { validate } from './config/validate';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { InvoicesModule } from './invoices/invoices.module';
import { MerchantsModule } from './merchants/merchants.module';
import { PaymentsModule } from './payments/payments.module';
import { RedisModule } from './redis/redis.module';
import { SettlementModule } from './settlement/settlement.module';
import { StellarModule } from './stellar/stellar.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { ScheduleModule } from "@nestjs/schedule";
import { AuthModule } from "./auth/auth.module";
import { ComplianceModule } from "./compliance/compliance.module";
import { validate } from "./config/validate";
import { DatabaseModule } from "./database/database.module";
import { DevModule } from "./dev/dev.module";
import { HealthModule } from "./health/health.module";
import { InvoicesModule } from "./invoices/invoices.module";
import { MerchantsModule } from "./merchants/merchants.module";
import { PaymentsModule } from "./payments/payments.module";
import { RedisModule } from "./redis/redis.module";
import { SettlementModule } from "./settlement/settlement.module";
import { StellarModule } from "./stellar/stellar.module";
import { WebhooksModule } from "./webhooks/webhooks.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    ScheduleModule.forRoot(),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: { expiresIn: config.get<string>("JWT_EXPIRY", "15m") },
      }),
    }),
    DatabaseModule,
    RedisModule,
    HealthModule,
    AuthModule,
    AuditModule,
    MerchantsModule,
    StellarModule,
    ComplianceModule,
    InvoicesModule,
    PaymentsModule,
    WebhooksModule,
    SettlementModule,
    DevModule,
  ],
})
export class AppModule {}
