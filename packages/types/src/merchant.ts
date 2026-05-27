export interface Merchant {
  id: string;
  email: string;
  name: string;
  status: 'pending' | 'active' | 'suspended';
  kyc_status: 'pending' | 'approved' | 'rejected';
  tier: 'standard' | 'pro' | 'enterprise';
  stellar_address?: string;
  settlement_cadence?: 'daily' | 'weekly';
  test_mode: boolean;
  created_at: string;
}

export interface UpdateMerchantDto {
  name?: string;
  stellar_address?: string;
  settlement_cadence?: 'daily' | 'weekly';
  test_mode?: boolean;
}
