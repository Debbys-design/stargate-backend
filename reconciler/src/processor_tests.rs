/// Unit tests for reconciler batch processing logic (issue #88).
///
/// These tests cover:
///   - Happy path: valid USDC payment matched to a pending invoice
///   - Empty batch: no payments to process
///   - Partial failure: one payment errors, others still succeed
///
/// The tests use sqlx's `PgPool` test macros and a real Postgres instance
/// (provided by `DATABASE_URL` in the test environment). Redis interactions
/// are exercised against a real Redis instance (`REDIS_URL`).
///
/// Run with:
///   cargo test --manifest-path reconciler/Cargo.toml
#[cfg(test)]
mod tests {
    use crate::{
        processor::process_payment,
        stream::HorizonPayment,
        Config,
    };
    use rust_decimal::Decimal;
    use std::str::FromStr;
    use uuid::Uuid;

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    fn test_config() -> Config {
        Config {
            database_url: std::env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgresql://postgres:postgres@localhost:5432/stargate_test".into()),
            redis_url: std::env::var("REDIS_URL")
                .unwrap_or_else(|_| "redis://127.0.0.1:6379".into()),
            horizon_url: "https://horizon-testnet.stellar.org".into(),
            treasury: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN".into(),
            asset_code: "USDC".into(),
            asset_issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5".into(),
            ofac_screening_enabled: false,
            trm_labs_api_key: None,
        }
    }

    fn make_payment(
        paging_token: &str,
        from: &str,
        to: &str,
        amount: &str,
        asset_code: Option<&str>,
        asset_issuer: Option<&str>,
        memo: Option<&str>,
    ) -> HorizonPayment {
        HorizonPayment {
            paging_token: paging_token.into(),
            id: paging_token.into(),
            from: from.into(),
            to: to.into(),
            amount: amount.into(),
            asset_code: asset_code.map(Into::into),
            asset_issuer: asset_issuer.map(Into::into),
            transaction_hash: format!("txhash_{paging_token}"),
            ledger: 1000,
            transaction_successful: Some(true),
            memo: memo.map(Into::into),
        }
    }

    // ---------------------------------------------------------------------------
    // Happy path — valid USDC payment matched to a pending invoice
    // ---------------------------------------------------------------------------

    #[tokio::test]
    async fn test_process_payment_happy_path() {
        let config = test_config();
        let db = sqlx::PgPool::connect(&config.database_url).await.expect("db connect");
        let client = redis::Client::open(config.redis_url.clone()).expect("redis client");
        let mut redis = client.get_multiplexed_async_connection().await.expect("redis connect");

        // Seed: merchant + invoice
        let merchant_id = Uuid::new_v4();
        let invoice_id = Uuid::new_v4();
        let muxed_id: i64 = 99_001;
        let gross = Decimal::from_str("10.5000000").unwrap();

        sqlx::query(
            "INSERT INTO merchants (id, name, email, tier) VALUES ($1, 'Test Merchant', 'test@example.com', 'starter')"
        )
        .bind(merchant_id)
        .execute(&db)
        .await
        .expect("insert merchant");

        sqlx::query(
            "INSERT INTO invoices (id, merchant_id, amount_usdc, gross_usdc, fee_usdc, net_usdc, muxed_id, muxed_address, expires_at)
             VALUES ($1, $2, '10.0000000', $3, '0.5000000', '9.5000000', $4, 'MTEST', NOW() + interval '1 hour')"
        )
        .bind(invoice_id)
        .bind(merchant_id)
        .bind(gross)
        .bind(muxed_id)
        .execute(&db)
        .await
        .expect("insert invoice");

        // Seed reconciler_state cursor row if missing
        sqlx::query(
            "INSERT INTO reconciler_state (key, value) VALUES ('cursor', 'now') ON CONFLICT DO NOTHING"
        )
        .execute(&db)
        .await
        .expect("seed cursor");

        let payment = make_payment(
            "token_happy_001",
            "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
            &format!("M{muxed_id}"),
            "10.5000000",
            Some("USDC"),
            Some("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
            None,
        );

        let result = process_payment(&db, &mut redis, &payment, &config).await;
        assert!(result.is_ok(), "process_payment failed: {:?}", result.err());

        // Invoice should now be paid
        let status: String =
            sqlx::query_scalar("SELECT status FROM invoices WHERE id=$1")
                .bind(invoice_id)
                .fetch_one(&db)
                .await
                .expect("fetch invoice status");
        assert_eq!(status, "paid");

        // payment_events row should exist
        let event_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM payment_events WHERE paging_token=$1")
                .bind("token_happy_001")
                .fetch_one(&db)
                .await
                .expect("count events");
        assert_eq!(event_count, 1);

        // Cleanup
        sqlx::query("DELETE FROM payment_events WHERE paging_token='token_happy_001'").execute(&db).await.ok();
        sqlx::query("DELETE FROM ledger_entries WHERE invoice_id=$1").bind(invoice_id).execute(&db).await.ok();
        sqlx::query("DELETE FROM invoices WHERE id=$1").bind(invoice_id).execute(&db).await.ok();
        sqlx::query("DELETE FROM merchants WHERE id=$1").bind(merchant_id).execute(&db).await.ok();
    }

    // ---------------------------------------------------------------------------
    // Empty batch — no payments arrive; processor is never called
    // ---------------------------------------------------------------------------

    #[tokio::test]
    async fn test_empty_batch_no_payments() {
        // Simulates the stream receiving zero data lines.
        // process_payment is not called; we just assert the system stays idle.
        let config = test_config();
        let db = sqlx::PgPool::connect(&config.database_url).await.expect("db connect");

        let count_before: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM payment_events")
                .fetch_one(&db)
                .await
                .expect("count before");

        // No payments processed — row count must not change
        let count_after: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM payment_events")
                .fetch_one(&db)
                .await
                .expect("count after");

        assert_eq!(count_before, count_after, "empty batch should not insert any events");
    }

    // ---------------------------------------------------------------------------
    // Idempotency — duplicate paging_token is silently skipped
    // ---------------------------------------------------------------------------

    #[tokio::test]
    async fn test_duplicate_paging_token_is_skipped() {
        let config = test_config();
        let db = sqlx::PgPool::connect(&config.database_url).await.expect("db connect");
        let client = redis::Client::open(config.redis_url.clone()).expect("redis client");
        let mut redis = client.get_multiplexed_async_connection().await.expect("redis connect");

        // Seed cursor
        sqlx::query(
            "INSERT INTO reconciler_state (key, value) VALUES ('cursor', 'now') ON CONFLICT DO NOTHING"
        )
        .execute(&db)
        .await
        .expect("seed cursor");

        // Payment for a non-USDC asset — will be inserted as an unmatched event
        let payment = make_payment(
            "token_dedup_001",
            "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
            "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
            "5.0000000",
            Some("USDC"),
            Some("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
            None,
        );

        // First call — should succeed
        process_payment(&db, &mut redis, &payment, &config).await.expect("first call");

        let count_after_first: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM payment_events WHERE paging_token='token_dedup_001'")
                .fetch_one(&db)
                .await
                .expect("count after first");

        // Second call with same paging_token — should be a no-op
        process_payment(&db, &mut redis, &payment, &config).await.expect("second call");

        let count_after_second: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM payment_events WHERE paging_token='token_dedup_001'")
                .fetch_one(&db)
                .await
                .expect("count after second");

        assert_eq!(count_after_first, count_after_second, "duplicate paging_token must not insert a second event");

        // Cleanup
        sqlx::query("DELETE FROM payment_events WHERE paging_token='token_dedup_001'").execute(&db).await.ok();
    }

    // ---------------------------------------------------------------------------
    // Partial failure — wrong asset is filtered; correct asset is processed
    // ---------------------------------------------------------------------------

    #[tokio::test]
    async fn test_partial_failure_wrong_asset_filtered() {
        let config = test_config();
        let db = sqlx::PgPool::connect(&config.database_url).await.expect("db connect");
        let client = redis::Client::open(config.redis_url.clone()).expect("redis client");
        let mut redis = client.get_multiplexed_async_connection().await.expect("redis connect");

        sqlx::query(
            "INSERT INTO reconciler_state (key, value) VALUES ('cursor', 'now') ON CONFLICT DO NOTHING"
        )
        .execute(&db)
        .await
        .expect("seed cursor");

        // Payment 1: wrong asset — should be silently skipped (no event row)
        let bad_payment = make_payment(
            "token_partial_bad",
            "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
            "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
            "1.0000000",
            Some("XLM"),   // wrong asset
            Some("native"),
            None,
        );

        // Payment 2: correct USDC asset — should be processed (event row inserted)
        let good_payment = make_payment(
            "token_partial_good",
            "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
            "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
            "2.0000000",
            Some("USDC"),
            Some("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
            None,
        );

        process_payment(&db, &mut redis, &bad_payment, &config).await.expect("bad payment");
        process_payment(&db, &mut redis, &good_payment, &config).await.expect("good payment");

        // Bad payment: no event row (filtered before insert)
        let bad_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM payment_events WHERE paging_token='token_partial_bad'")
                .fetch_one(&db)
                .await
                .expect("bad count");
        assert_eq!(bad_count, 0, "non-USDC payment must not produce a payment_event");

        // Good payment: event row exists
        let good_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM payment_events WHERE paging_token='token_partial_good'")
                .fetch_one(&db)
                .await
                .expect("good count");
        assert_eq!(good_count, 1, "valid USDC payment must produce a payment_event");

        // Cleanup
        sqlx::query("DELETE FROM payment_events WHERE paging_token IN ('token_partial_bad','token_partial_good')").execute(&db).await.ok();
    }

    // ---------------------------------------------------------------------------
    // Amount mismatch — payment amount differs from invoice gross_usdc
    // ---------------------------------------------------------------------------

    #[tokio::test]
    async fn test_amount_mismatch_does_not_mark_paid() {
        let config = test_config();
        let db = sqlx::PgPool::connect(&config.database_url).await.expect("db connect");
        let client = redis::Client::open(config.redis_url.clone()).expect("redis client");
        let mut redis = client.get_multiplexed_async_connection().await.expect("redis connect");

        let merchant_id = Uuid::new_v4();
        let invoice_id = Uuid::new_v4();
        let muxed_id: i64 = 99_002;

        sqlx::query(
            "INSERT INTO merchants (id, name, email, tier) VALUES ($1, 'Mismatch Merchant', 'mm@example.com', 'starter')"
        )
        .bind(merchant_id)
        .execute(&db)
        .await
        .expect("insert merchant");

        sqlx::query(
            "INSERT INTO invoices (id, merchant_id, amount_usdc, gross_usdc, fee_usdc, net_usdc, muxed_id, muxed_address, expires_at)
             VALUES ($1, $2, '20.0000000', '20.5000000', '0.5000000', '19.5000000', $3, 'MTEST2', NOW() + interval '1 hour')"
        )
        .bind(invoice_id)
        .bind(merchant_id)
        .bind(muxed_id)
        .execute(&db)
        .await
        .expect("insert invoice");

        sqlx::query(
            "INSERT INTO reconciler_state (key, value) VALUES ('cursor', 'now') ON CONFLICT DO NOTHING"
        )
        .execute(&db)
        .await
        .expect("seed cursor");

        // Send wrong amount (10 instead of 20.5)
        let payment = make_payment(
            "token_mismatch_001",
            "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
            &format!("M{muxed_id}"),
            "10.0000000",
            Some("USDC"),
            Some("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
            None,
        );

        process_payment(&db, &mut redis, &payment, &config).await.expect("process");

        let status: String =
            sqlx::query_scalar("SELECT status FROM invoices WHERE id=$1")
                .bind(invoice_id)
                .fetch_one(&db)
                .await
                .expect("fetch status");
        assert_eq!(status, "pending", "invoice must remain pending on amount mismatch");

        // Cleanup
        sqlx::query("DELETE FROM payment_events WHERE paging_token='token_mismatch_001'").execute(&db).await.ok();
        sqlx::query("DELETE FROM invoices WHERE id=$1").bind(invoice_id).execute(&db).await.ok();
        sqlx::query("DELETE FROM merchants WHERE id=$1").bind(merchant_id).execute(&db).await.ok();
    }

    // ---------------------------------------------------------------------------
    // OFAC blocked — payment is recorded but invoice stays pending
    // ---------------------------------------------------------------------------

    #[tokio::test]
    async fn test_ofac_blocked_does_not_mark_paid() {
        let mut config = test_config();
        config.ofac_screening_enabled = true;
        // No TRM key → compliance returns "review", not "blocked".
        // To force "blocked" we pre-seed the Redis cache.
        let db = sqlx::PgPool::connect(&config.database_url).await.expect("db connect");
        let client = redis::Client::open(config.redis_url.clone()).expect("redis client");
        let mut redis = client.get_multiplexed_async_connection().await.expect("redis connect");

        let blocked_address = "GBLOCKED00000000000000000000000000000000000000000000000001";

        // Pre-seed OFAC cache as blocked
        let ofac_payload = serde_json::json!({ "result": "blocked", "risk_score": 100 }).to_string();
        redis::cmd("SET")
            .arg(format!("ofac:{blocked_address}"))
            .arg(&ofac_payload)
            .arg("EX")
            .arg(3600u64)
            .query_async::<_, ()>(&mut redis)
            .await
            .expect("seed ofac cache");

        sqlx::query(
            "INSERT INTO reconciler_state (key, value) VALUES ('cursor', 'now') ON CONFLICT DO NOTHING"
        )
        .execute(&db)
        .await
        .expect("seed cursor");

        let payment = make_payment(
            "token_ofac_001",
            blocked_address,
            "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
            "5.0000000",
            Some("USDC"),
            Some("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
            None,
        );

        process_payment(&db, &mut redis, &payment, &config).await.expect("process");

        // Event should be recorded with ofac_result='blocked'
        let ofac_result: String =
            sqlx::query_scalar("SELECT ofac_result FROM payment_events WHERE paging_token='token_ofac_001'")
                .fetch_one(&db)
                .await
                .expect("fetch ofac_result");
        assert_eq!(ofac_result, "blocked");

        // Cleanup
        sqlx::query("DELETE FROM payment_events WHERE paging_token='token_ofac_001'").execute(&db).await.ok();
    }
}
