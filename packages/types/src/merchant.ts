export interface Merchant {
  id: string;
  email: string;
  name: string;
  status: 'pending' | 'active' | 'suspended';
  tier: 'standard' | 'pro' | 'enterprise';
  stellar_address?: string;
  settlement_cadence?: 'daily' | 'weekly';
  created_at: string;
}

export interface UpdateMerchantDto {
  name?: string;
  stellar_address?: string;
  settlement_cadence?: 'daily' | 'weekly';
}
