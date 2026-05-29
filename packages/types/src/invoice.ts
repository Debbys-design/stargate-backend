import { z } from 'zod';

export const SUPPORTED_CURRENCIES = ['USDC', 'EURC', 'XLM'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const CreateInvoiceDtoSchema = z.object({
  amount: z.union([z.number().positive().max(100_000), z.string().regex(/^\d+(\.\d{1,7})?$/)]).optional(),
  /** @deprecated use `amount` instead */
  amount_usdc: z.union([z.number().positive().max(100_000), z.string().regex(/^\d+(\.\d{1,7})?$/)]).optional(),
  currency: z.enum(SUPPORTED_CURRENCIES).default('USDC'),
  description: z.string().max(500).optional(),
  expires_in_minutes: z.number().int().min(5).max(10080).default(60),
  partial_payments_enabled: z.boolean().default(false),
});

export type CreateInvoiceDto = z.infer<typeof CreateInvoiceDtoSchema>;
export type InvoiceStatus = 'pending' | 'partial' | 'paid' | 'expired' | 'cancelled';

export interface Invoice {
  id: string;
  merchant_id: string;
  currency: SupportedCurrency;
  amount_usdc: string;
  gross_usdc: string;
  gross_usdc_equiv: string;
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
  limit: number;
  items: Invoice[];
  nextCursor: string | null;
}

export interface PublicInvoice {
  id: string;
  currency: SupportedCurrency;
  gross_usdc: string;
  gross_usdc_equiv: string;
  description?: string;
  merchant_name: string;
  status: InvoiceStatus;
  muxed_address: string;
  expires_at: string;
}
