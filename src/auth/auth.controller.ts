import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Merchant registration' })
  @ApiResponse({ status: 201, description: 'Access and refresh tokens issued' })
  async register(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.register(body);
    this.setRefreshCookie(res, result.refreshToken);
    return result.publicResponse;
  }

  @Post('login')
  @ApiOperation({ summary: 'Merchant login' })
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(body);
    this.setRefreshCookie(res, result.refreshToken);
    return result.publicResponse;
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token from httpOnly cookie' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.refresh(req.cookies?.stargate_refresh);
    this.setRefreshCookie(res, result.refreshToken);
    return result.publicResponse;
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.stargate_refresh);
    res.clearCookie('stargate_refresh', { path: '/auth' });
    return { ok: true };
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie('stargate_refresh', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth',
    });
  }
}
