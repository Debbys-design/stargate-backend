import { z } from 'zod';

export const CreateInvoiceDtoSchema = z.object({
  amount_usdc: z.number().positive().max(100_000),
  description: z.string().max(500).optional(),
  expires_in_minutes: z.number().int().min(5).max(10080).default(60),
});

export type CreateInvoiceDto = z.infer<typeof CreateInvoiceDtoSchema>;
export type InvoiceStatus = 'pending' | 'paid' | 'expired' | 'cancelled';

export interface Invoice {
  id: string;
  merchant_id: string;
  amount_usdc: string;
  gross_usdc: string;
  fee_usdc: string;
  net_usdc: string;
  description?: string;
  status: InvoiceStatus;
  muxed_address: string;
  payment_url: string;
  expires_at: string;
  paid_at?: string;
  created_at: string;
}

export interface InvoiceListResponse {
  page: number;
  limit: number;
  total: number;
  items: Invoice[];
}

export interface PublicInvoice {
  id: string;
  gross_usdc: string;
  description?: string;
  merchant_name: string;
  status: InvoiceStatus;
  muxed_address: string;
  expires_at: string;
}
