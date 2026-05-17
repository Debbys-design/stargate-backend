export interface PaymentEvent {
  id: number;
  invoice_id: string;
  payer_address: string;
  amount_usdc: string;
  stellar_tx_hash: string;
  ofac_result: 'clear' | 'blocked' | 'review';
  created_at: string;
}

export interface PaymentStreamEvent {
  status: 'pending' | 'paid' | 'expired' | 'cancelled';
  invoice_id: string;
  paid_at?: string;
  tx_hash?: string;
}
