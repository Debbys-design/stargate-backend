use crate::{compliance, matcher, stream::HorizonPayment, Config};
use anyhow::Result;
use redis::{aio::MultiplexedConnection, AsyncCommands};
use rust_decimal::Decimal;
use sqlx::PgPool;
use std::str::FromStr;

pub async fn process_payment(
    db: &PgPool,
    redis: &mut MultiplexedConnection,
    payment: &HorizonPayment,
    config: &Config,
) -> Result<()> {
    if event_exists(db, &payment.paging_token).await? {
        return Ok(());
    }

    if payment.asset_code.as_deref() != Some(&config.asset_code)
        || payment.asset_issuer.as_deref() != Some(&config.asset_issuer)
    {
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
        if paid != inv.gross_usdc.round_dp(7) {
            tracing::warn!("amount mismatch on invoice {}: expected {} got {}", inv.id, inv.gross_usdc, paid);
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
        .bind(inv.gross_usdc)
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
        // #36 Track conversion for payment link analytics
        sqlx::query(
            r#"INSERT INTO payment_link_events (invoice_id, merchant_id, event_type)
               VALUES ($1, $2, 'conversion')"#,
        )
        .bind(inv.id)
        .bind(inv.merchant_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        let payload = serde_json::json!({ "status": "paid", "invoice_id": inv.id, "tx_hash": payment.transaction_hash });
        redis.publish::<_, _, ()>(format!("invoice:{}", inv.id), payload.to_string()).await?;
    }

    save_cursor(db, &payment.paging_token).await?;
    Ok(())
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
    .bind(payment.asset_code.as_deref().unwrap_or(""))
    .bind(payment.asset_issuer.as_deref().unwrap_or(""))
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
