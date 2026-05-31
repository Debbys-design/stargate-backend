use crate::stream::HorizonPayment;
use anyhow::Result;
use rust_decimal::Decimal;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(Clone, Debug, FromRow)]
pub struct InvoiceRow {
    pub id: Uuid,
    pub merchant_id: Uuid,
    pub gross_usdc: Decimal,
    pub fee_usdc: Decimal,
    pub net_usdc: Decimal,
    /// Native currency of the invoice (USDC, EURC, XLM)
    pub currency: String,
    /// USDC-equivalent gross at creation time (for ledger entries)
    pub gross_usdc_equiv: Decimal,
}

/// Match a Horizon payment to a pending invoice.
///
/// Matching rules:
/// 1. The payment asset must match the invoice currency.
/// 2. The destination must be the invoice's muxed address (by muxed_id) or memo.
pub async fn match_invoice(db: &PgPool, payment: &HorizonPayment) -> Result<Option<InvoiceRow>> {
    let payment_currency = payment_asset_currency(payment);

    if let Some(muxed_id) = decode_muxed_id(&payment.to) {
        if let Some(invoice) = sqlx::query_as::<_, InvoiceRow>(
            "SELECT id, merchant_id, gross_usdc, fee_usdc, net_usdc, currency, gross_usdc_equiv \
             FROM invoices WHERE muxed_id=$1 AND status='pending'",
        )
        .bind(muxed_id)
        .fetch_optional(db)
        .await?
        {
            // Asset must match invoice currency
            if invoice.currency == payment_currency {
                return Ok(Some(invoice));
            }
            return Ok(None);
        }
    }

    if let Some(memo) = &payment.memo {
        if let Some(invoice) = sqlx::query_as::<_, InvoiceRow>(
            "SELECT id, merchant_id, gross_usdc, fee_usdc, net_usdc, currency, gross_usdc_equiv \
             FROM invoices WHERE memo=$1 AND status='pending'",
        )
        .bind(memo)
        .fetch_optional(db)
        .await?
        {
            if invoice.currency == payment_currency {
                return Ok(Some(invoice));
            }
        }
    }

    Ok(None)
}

/// Map a Horizon payment's asset to our currency code.
pub fn payment_asset_currency(payment: &HorizonPayment) -> String {
    match payment.asset_type.as_deref() {
        Some("native") => "XLM".to_string(),
        _ => payment.asset_code.clone().unwrap_or_default(),
    }
}

fn decode_muxed_id(destination: &str) -> Option<i64> {
    destination.strip_prefix('M')?.chars().rev().take(10).collect::<String>().parse().ok()
}
