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
}

pub async fn match_invoice(db: &PgPool, payment: &HorizonPayment) -> Result<Option<InvoiceRow>> {
    if let Some(muxed_id) = decode_muxed_id(&payment.to) {
        if let Some(invoice) = sqlx::query_as::<_, InvoiceRow>(
            "SELECT id, merchant_id, gross_usdc, fee_usdc, net_usdc FROM invoices WHERE muxed_id=$1 AND status='pending'",
        )
        .bind(muxed_id)
        .fetch_optional(db)
        .await?
        {
            return Ok(Some(invoice));
        }
    }
    if let Some(memo) = &payment.memo {
        return Ok(sqlx::query_as::<_, InvoiceRow>(
            "SELECT id, merchant_id, gross_usdc, fee_usdc, net_usdc FROM invoices WHERE memo=$1 AND status='pending'",
        )
        .bind(memo)
        .fetch_optional(db)
        .await?);
    }
    Ok(None)
}

fn decode_muxed_id(destination: &str) -> Option<i64> {
    destination.strip_prefix('M')?.chars().rev().take(10).collect::<String>().parse().ok()
}
