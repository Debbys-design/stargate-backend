export interface Webhook {
  id: string;
  merchant_id?: string;
  url: string;
  events: string[];
  active: boolean;
  created_at: string;
}

export interface CreateWebhookDto {
  url: string;
  events: Array<'invoice.paid' | 'invoice.expired' | 'invoice.cancelled' | 'settlement.completed'>;
}

export interface WebhookDelivery {
  id: number;
  webhook_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'delivered' | 'failed' | 'dead';
  attempts: number;
  response_status?: number;
  delivered_at?: string;
  created_at: string;
}
