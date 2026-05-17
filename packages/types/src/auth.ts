import { Merchant } from './merchant';

export interface RegisterDto {
  email: string;
  name: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthTokens {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  merchant?: Merchant;
}

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error: string;
}
