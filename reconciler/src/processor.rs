use crate::{compliance, matcher, stream::HorizonPayment, Config};
use anyhow::Result;
use redis::{aio::MultiplexedConnection, AsyncCommands};
use rust_decimal::Decimal;
use sqlx::PgPool;
use std::str::FromStr;

#[cfg(test)]
#[path = "processor_tests.rs"]
mod tests;

/// Accepted asset codes for payment processing.
const ACCEPTED_ASSETS: &[&str] = &["USDC", "EURC", "XLM"];

pub async fn process_payment(
    db: &PgPool,
    redis: &mut MultiplexedConnection,
    payment: &HorizonPayment,
    config: &Config,
) -> Result<()> {
    if event_exists(db, &payment.paging_token).await? {
        return Ok(());
    }

    // Accept USDC (configured issuer), EURC (configured issuer), or native XLM
    let is_accepted = is_accepted_asset(payment, config);
    if !is_accepted {
        return Ok(());
    }

    let ofac = compliance::screen_address(redis, &payment.from, config).await?;
    if ofac.result == "blocked" {
        insert_payment_event(db, payment, None, &ofac.result).await?;
        save_cursor(db, &payment.paging_token).await?;
        return Ok(());
    }

    let invoice = matcher::match_invoice(db, payment).await?;
    if let Some(ref inv) = invoice {
        let paid = Decimal::from_str(&payment.amount)?;
        // Compare against gross_usdc_equiv for USDC-normalised matching,
        // or gross_usdc for same-currency invoices
        let expected = if inv.currency == "USDC" {
            inv.gross_usdc.round_dp(7)
        } else {
            inv.gross_usdc.round_dp(7)
        };
        if paid != expected {
            tracing::warn!(
                "amount mismatch on invoice {}: expected {} {} got {}",
                inv.id, expected, inv.currency, paid
            );
            insert_payment_event(db, payment, Some(inv.id), "amount_mismatch").await?;
            save_cursor(db, &payment.paging_token).await?;
            return Ok(());
        }
    }

    let event_id = insert_payment_event(db, payment, invoice.as_ref().map(|inv| inv.id), &ofac.result).await?;
    if let Some(inv) = invoice {
        let mut tx = db.begin().await?;
        sqlx::query(
            r#"INSERT INTO ledger_entries (invoice_id, merchant_id, event_id, gross_usdc, fee_usdc, net_usdc, type)
             VALUES ($1,$2,$3,$4,$5,$6,'payment')"#,
        )
        .bind(inv.id)
        .bind(inv.merchant_id)
        .bind(event_id)
        .bind(inv.gross_usdc_equiv) // always store USDC equiv in ledger
        .bind(inv.fee_usdc)
        .bind(inv.net_usdc)
        .execute(&mut *tx)
        .await?;
        sqlx::query("UPDATE invoices SET status='paid', paid_at=NOW() WHERE id=$1 AND status='pending'")
            .bind(inv.id)
            .execute(&mut *tx)
            .await?;
        sqlx::query(
            r#"INSERT INTO webhook_deliveries (webhook_id, event_type, payload)
             SELECT id, 'invoice.paid', jsonb_build_object('invoice_id', $1::uuid, 'event_id', $2::bigint)
             FROM webhooks WHERE merchant_id=$3 AND active=true AND 'invoice.paid'=ANY(events)"#,
        )
        .bind(inv.id)
        .bind(event_id)
        .bind(inv.merchant_id)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            r#"INSERT INTO payment_link_events (invoice_id, merchant_id, event_type)
               VALUES ($1, $2, 'conversion')"#,
        )
        .bind(inv.id)
        .bind(inv.merchant_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        let payload = serde_json::json!({
            "status": "paid",
            "invoice_id": inv.id,
            "tx_hash": payment.transaction_hash,
            "currency": inv.currency,
        });
        redis.publish::<_, _, ()>(format!("invoice:{}", inv.id), payload.to_string()).await?;
    }

    save_cursor(db, &payment.paging_token).await?;
    Ok(())
}

/// Returns true if the payment is in an accepted asset (USDC, EURC, or XLM).
fn is_accepted_asset(payment: &HorizonPayment, config: &Config) -> bool {
    // Native XLM
    if payment.asset_type.as_deref() == Some("native") {
        return ACCEPTED_ASSETS.contains(&"XLM");
    }
    let code = match payment.asset_code.as_deref() {
        Some(c) => c,
        None => return false,
    };
    if !ACCEPTED_ASSETS.contains(&code) {
        return false;
    }
    // USDC must match the configured issuer
    if code == "USDC" {
        return payment.asset_issuer.as_deref() == Some(&config.asset_issuer);
    }
    // EURC must match the configured EURC issuer (if set), otherwise accept any
    if code == "EURC" {
        if let Some(ref eurc_issuer) = config.eurc_asset_issuer {
            return payment.asset_issuer.as_deref() == Some(eurc_issuer.as_str());
        }
        return true;
    }
    false
}

async fn event_exists(db: &PgPool, paging_token: &str) -> Result<bool> {
    let exists: Option<i64> = sqlx::query_scalar("SELECT 1 FROM payment_events WHERE paging_token=$1")
        .bind(paging_token)
        .fetch_optional(db)
        .await?;
    Ok(exists.is_some())
}

async fn insert_payment_event(
    db: &PgPool,
    payment: &HorizonPayment,
    invoice_id: Option<uuid::Uuid>,
    ofac_result: &str,
) -> Result<i64> {
    let id = sqlx::query_scalar::<_, i64>(
        r#"INSERT INTO payment_events
         (paging_token, invoice_id, payer_address, amount_usdc, asset_code, asset_issuer, memo, stellar_tx_hash, ledger_sequence, ofac_result, matched_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, CASE WHEN $2::uuid IS NULL THEN NULL ELSE NOW() END)
         RETURNING id"#,
    )
    .bind(&payment.paging_token)
    .bind(invoice_id)
    .bind(&payment.from)
    .bind(Decimal::from_str(&payment.amount)?)
    .bind(payment.asset_code.as_deref().unwrap_or(
        if payment.asset_type.as_deref() == Some("native") { "XLM" } else { "" }
    ))
    .bind(payment.asset_issuer.as_deref().unwrap_or("native"))
    .bind(&payment.memo)
    .bind(&payment.transaction_hash)
    .bind(payment.ledger)
    .bind(ofac_result)
    .fetch_one(db)
    .await?;
    Ok(id)
}

async fn save_cursor(db: &PgPool, cursor: &str) -> Result<()> {
    sqlx::query(
        "UPDATE reconciler_state SET value=$1, updated_at=NOW() WHERE key='cursor'",
    )
    .bind(cursor)
    .execute(db)
    .await?;
    Ok(())
}
