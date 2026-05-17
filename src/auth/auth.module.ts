import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { MerchantsModule } from '../merchants/merchants.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [PassportModule, MerchantsModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
