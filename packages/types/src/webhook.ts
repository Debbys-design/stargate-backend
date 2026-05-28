export const WEBHOOK_EVENT_TYPES = [
  'invoice.paid',
  'invoice.expired',
  'invoice.cancelled',
  'settlement.completed',
  'merchant.kyc.approved',
  'merchant.kyc.rejected',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export interface Webhook {
  id: string;
  merchant_id?: string;
  url: string;
  events: WebhookEventType[];
  active: boolean;
  created_at: string;
}

export interface CreateWebhookDto {
  url: string;
  events: WebhookEventType[];
}

export interface WebhookDelivery {
  id: number;
  webhook_id: string;
  event_type: WebhookEventType;
  payload: Record<string, unknown>;
  status: 'pending' | 'delivered' | 'failed' | 'dead';
  attempts: number;
  response_status?: number;
  delivered_at?: string;
  created_at: string;
}
