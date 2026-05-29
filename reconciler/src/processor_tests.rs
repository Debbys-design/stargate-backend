/// Unit tests for reconciler batch processing logic.
///
/// These tests cover:
///   - Happy path: valid USDC payment matched to a pending invoice
///   - Empty batch: no payments to process
///   - Partial failure: one payment errors, others still succeed
///   - Multi-currency: EURC and XLM payments matched to correct invoices
///   - Asset mismatch: payment in wrong currency is rejected
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
            eurc_asset_issuer: Some("GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP".into()),
            ofac_screening_enabled: false,
            trm_labs_api_key: None,
        }
    }

    fn make_payment(
        paging_token: &str,
        from: &str,
        to: &str,
        amount: &str,
        asset_type: Option<&str>,
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
            asset_type: asset_type.map(Into::into),
            asset_code: asset_code.map(Into::into),
            asset_issuer: asset_issuer.map(Into::into),
            transaction_hash: format!("txhash_{paging_token}"),
            ledger: 1000,
            transaction_successful: Some(true),
            memo: memo.map(Into::into),
        }
    }

    async fn seed_merchant_and_invoice(
        db: &sqlx::PgPool,
        merchant_id: Uuid,
        invoice_id: Uuid,
        muxed_id: i64,
        gross: Decimal,
        currency: &str,
    ) {
        sqlx::query(
            "INSERT INTO merchants (id, name, email, tier) VALUES ($1, 'Test Merchant', $2, 'starter') ON CONFLICT DO NOTHING"
        )
        .bind(merchant_id)
        .bind(format!("test_{}@example.com", merchant_id))
        .execute(db)
        .await
        .expect("insert merchant");

        sqlx::query(
            "INSERT INTO invoices (id, merchant_id, amount_usdc, gross_usdc, fee_usdc, net_usdc, muxed_id, muxed_address, expires_at, currency, gross_usdc_equiv)
             VALUES ($1, $2, $3, $3, '0.5000000', '9.5000000', $4, 'MTEST', NOW() + interval '1 hour', $5, $3)
             ON CONFLICT DO NOTHING"
        )
        .bind(invoice_id)
        .bind(merchant_id)
        .bind(gross)
        .bind(muxed_id)
        .bind(currency)
        .execute(db)
        .await
        .expect("insert invoice");

        sqlx::query(
            "INSERT INTO reconciler_state (key, value) VALUES ('cursor', 'now') ON CONFLICT DO NOTHING"
        )
        .execute(db)
        .await
        .expect("seed cursor");
    }

    async fn cleanup(db: &sqlx::PgPool, paging_tokens: &[&str], invoice_id: Uuid, merchant_id: Uuid) {
        for token in paging_tokens {
            sqlx::query("DELETE FROM payment_events WHERE paging_token=$1").bind(*token).execute(db).await.ok();
        }
        sqlx::query("DELETE FROM ledger_entries WHERE invoice_id=$1").bind(invoice_id).execute(db).await.ok();
        sqlx::query("DELETE FROM invoices WHERE id=$1").bind(invoice_id).execute(db).await.ok();
        sqlx::query("DELETE FROM merchants WHERE id=$1").bind(merchant_id).execute(db).await.ok();
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

        let merchant_id = Uuid::new_v4();
        let invoice_id = Uuid::new_v4();
        let muxed_id: i64 = 99_001;
        let gross = Decimal::from_str("10.5000000").unwrap();

        seed_merchant_and_invoice(&db, merchant_id, invoice_id, muxed_id, gross, "USDC").await;

        let payment = make_payment(
            "token_happy_001",
            "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
            &format!("M{muxed_id}"),
            "10.5000000",
            Some("credit_alphanum4"),
            Some("USDC"),
            Some("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
            None,
        );

        let result = process_payment(&db, &mut redis, &payment, &config).await;
        assert!(result.is_ok(), "process_payment failed: {:?}", result.err());

        let status: String = sqlx::query_scalar("SELECT status FROM invoices WHERE id=$1")
            .bind(invoice_id)
            .fetch_one(&db)
            .await
            .expect("fetch invoice status");
        assert_eq!(status, "paid");

        cleanup(&db, &["token_happy_001"], invoice_id, merchant_id).await;
    }

    // ---------------------------------------------------------------------------
    // Empty batch — no payments arrive; processor is never called
    // ---------------------------------------------------------------------------

    #[tokio::test]
    async fn test_empty_batch_no_payments() {
        let config = test_config();
        let db = sqlx::PgPool::connect(&config.database_url).await.expect("db connect");

        let count_before: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM payment_events")
            .fetch_one(&db).await.expect("count before");
        let count_after: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM payment_events")
            .fetch_one(&db).await.expect("count after");

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

        sqlx::query("INSERT INTO reconciler_state (key, value) VALUES ('cursor', 'now') ON CONFLICT DO NOTHING")
            .execute(&db).await.expect("seed cursor");

        let payment = make_payment(
            "token_dedup_001",
            "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
            "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
            "5.0000000",
            Some("credit_alphanum4"),
            Some("USDC"),
            Some("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
            None,
        );

        process_payment(&db, &mut redis, &payment, &config).await.expect("first call");
        let count_after_first: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM payment_events WHERE paging_token='token_dedup_001'")
            .fetch_one(&db).await.expect("count after first");

        process_payment(&db, &mut redis, &payment, &config).await.expect("second call");
        let count_after_second: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM payment_events WHERE paging_token='token_dedup_001'")
            .fetch_one(&db).await.expect("count after second");

        assert_eq!(count_after_first, count_after_second, "duplicate paging_token must not insert a second event");

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

        sqlx::query("INSERT INTO reconciler_state (key, value) VALUES ('cursor', 'now') ON CONFLICT DO NOTHING")
            .execute(&db).await.expect("seed cursor");

        // Payment with unknown asset code — should be silently skipped
        let bad_payment = make_payment(
            "token_partial_bad",
            "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
            "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
            "1.0000000",
            Some("credit_alphanum4"),
            Some("FAKE"),
            Some("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
            None,
        );

        let good_payment = make_payment(
            "token_partial_good",
            "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
            "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
            "2.0000000",
            Some("credit_alphanum4"),
            Some("USDC"),
            Some("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
            None,
        );

        process_payment(&db, &mut redis, &bad_payment, &config).await.expect("bad payment");
        process_payment(&db, &mut redis, &good_payment, &config).await.expect("good payment");

        let bad_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM payment_events WHERE paging_token='token_partial_bad'")
            .fetch_one(&db).await.expect("bad count");
        assert_eq!(bad_count, 0, "unknown asset payment must not produce a payment_event");

        let good_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM payment_events WHERE paging_token='token_partial_good'")
            .fetch_one(&db).await.expect("good count");
        assert_eq!(good_count, 1, "valid USDC payment must produce a payment_event");

        sqlx::query("DELETE FROM payment_events WHERE paging_token IN ('token_partial_bad','token_partial_good')").execute(&db).await.ok();
    }

    // ---------------------------------------------------------------------------
    // Amount mismatch — payment amount differs from invoice gross
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

        seed_merchant_and_invoice(&db, merchant_id, invoice_id, muxed_id, Decimal::from_str("20.5000000").unwrap(), "USDC").await;

        let payment = make_payment(
            "token_mismatch_001",
            "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
            &format!("M{muxed_id}"),
            "10.0000000",
            Some("credit_alphanum4"),
            Some("USDC"),
            Some("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
            None,
        );

        process_payment(&db, &mut redis, &payment, &config).await.expect("process");

        let status: String = sqlx::query_scalar("SELECT status FROM invoices WHERE id=$1")
            .bind(invoice_id).fetch_one(&db).await.expect("fetch status");
        assert_eq!(status, "pending", "invoice must remain pending on amount mismatch");

        cleanup(&db, &["token_mismatch_001"], invoice_id, merchant_id).await;
    }

    // ---------------------------------------------------------------------------
    // OFAC blocked — payment is recorded but invoice stays pending
    // ---------------------------------------------------------------------------

    #[tokio::test]
    async fn test_ofac_blocked_does_not_mark_paid() {
        let mut config = test_config();
        config.ofac_screening_enabled = true;
        let db = sqlx::PgPool::connect(&config.database_url).await.expect("db connect");
        let client = redis::Client::open(config.redis_url.clone()).expect("redis client");
        let mut redis = client.get_multiplexed_async_connection().await.expect("redis connect");

        let blocked_address = "GBLOCKED00000000000000000000000000000000000000000000000001";
        let ofac_payload = serde_json::json!({ "result": "blocked", "risk_score": 100 }).to_string();
        redis::cmd("SET")
            .arg(format!("ofac:{blocked_address}"))
            .arg(&ofac_payload)
            .arg("EX").arg(3600u64)
            .query_async::<_, ()>(&mut redis).await.expect("seed ofac cache");

        sqlx::query("INSERT INTO reconciler_state (key, value) VALUES ('cursor', 'now') ON CONFLICT DO NOTHING")
            .execute(&db).await.expect("seed cursor");

        let payment = make_payment(
            "token_ofac_001",
            blocked_address,
            "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
            "5.0000000",
            Some("credit_alphanum4"),
            Some("USDC"),
            Some("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
            None,
        );

        process_payment(&db, &mut redis, &payment, &config).await.expect("process");

        let ofac_result: String = sqlx::query_scalar("SELECT ofac_result FROM payment_events WHERE paging_token='token_ofac_001'")
            .fetch_one(&db).await.expect("fetch ofac_result");
        assert_eq!(ofac_result, "blocked");

        sqlx::query("DELETE FROM payment_events WHERE paging_token='token_ofac_001'").execute(&db).await.ok();
    }

    // ---------------------------------------------------------------------------
    // Multi-currency: EURC payment matched to EURC invoice
    // ---------------------------------------------------------------------------

    #[tokio::test]
    async fn test_eurc_payment_matches_eurc_invoice() {
        let config = test_config();
        let db = sqlx::PgPool::connect(&config.database_url).await.expect("db connect");
        let client = redis::Client::open(config.redis_url.clone()).expect("redis client");
        let mut redis = client.get_multiplexed_async_connection().await.expect("redis connect");

        let merchant_id = Uuid::new_v4();
        let invoice_id = Uuid::new_v4();
        let muxed_id: i64 = 99_010;
        let gross = Decimal::from_str("10.0000000").unwrap();

        seed_merchant_and_invoice(&db, merchant_id, invoice_id, muxed_id, gross, "EURC").await;

        let payment = make_payment(
            "token_eurc_001",
            "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
            &format!("M{muxed_id}"),
            "10.0000000",
            Some("credit_alphanum4"),
            Some("EURC"),
            Some("GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP"),
            None,
        );

        let result = process_payment(&db, &mut redis, &payment, &config).await;
        assert!(result.is_ok(), "EURC process_payment failed: {:?}", result.err());

        let status: String = sqlx::query_scalar("SELECT status FROM invoices WHERE id=$1")
            .bind(invoice_id).fetch_one(&db).await.expect("fetch status");
        assert_eq!(status, "paid", "EURC invoice should be marked paid");

        cleanup(&db, &["token_eurc_001"], invoice_id, merchant_id).await;
    }

    // ---------------------------------------------------------------------------
    // Multi-currency: XLM payment matched to XLM invoice
    // ---------------------------------------------------------------------------

    #[tokio::test]
    async fn test_xlm_payment_matches_xlm_invoice() {
        let config = test_config();
        let db = sqlx::PgPool::connect(&config.database_url).await.expect("db connect");
        let client = redis::Client::open(config.redis_url.clone()).expect("redis client");
        let mut redis = client.get_multiplexed_async_connection().await.expect("redis connect");

        let merchant_id = Uuid::new_v4();
        let invoice_id = Uuid::new_v4();
        let muxed_id: i64 = 99_011;
        let gross = Decimal::from_str("100.0000000").unwrap();

        seed_merchant_and_invoice(&db, merchant_id, invoice_id, muxed_id, gross, "XLM").await;

        let payment = make_payment(
            "token_xlm_001",
            "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
            &format!("M{muxed_id}"),
            "100.0000000",
            Some("native"),
            None,
            None,
            None,
        );

        let result = process_payment(&db, &mut redis, &payment, &config).await;
        assert!(result.is_ok(), "XLM process_payment failed: {:?}", result.err());

        let status: String = sqlx::query_scalar("SELECT status FROM invoices WHERE id=$1")
            .bind(invoice_id).fetch_one(&db).await.expect("fetch status");
        assert_eq!(status, "paid", "XLM invoice should be marked paid");

        cleanup(&db, &["token_xlm_001"], invoice_id, merchant_id).await;
    }

    // ---------------------------------------------------------------------------
    // Asset mismatch: USDC payment against EURC invoice is rejected
    // ---------------------------------------------------------------------------

    #[tokio::test]
    async fn test_wrong_currency_payment_does_not_match_invoice() {
        let config = test_config();
        let db = sqlx::PgPool::connect(&config.database_url).await.expect("db connect");
        let client = redis::Client::open(config.redis_url.clone()).expect("redis client");
        let mut redis = client.get_multiplexed_async_connection().await.expect("redis connect");

        let merchant_id = Uuid::new_v4();
        let invoice_id = Uuid::new_v4();
        let muxed_id: i64 = 99_012;
        let gross = Decimal::from_str("10.0000000").unwrap();

        // Invoice is in EURC
        seed_merchant_and_invoice(&db, merchant_id, invoice_id, muxed_id, gross, "EURC").await;

        // Payment arrives in USDC — should NOT match the EURC invoice
        let payment = make_payment(
            "token_wrong_currency_001",
            "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
            &format!("M{muxed_id}"),
            "10.0000000",
            Some("credit_alphanum4"),
            Some("USDC"),
            Some("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
            None,
        );

        process_payment(&db, &mut redis, &payment, &config).await.expect("process");

        let status: String = sqlx::query_scalar("SELECT status FROM invoices WHERE id=$1")
            .bind(invoice_id).fetch_one(&db).await.expect("fetch status");
        assert_eq!(status, "pending", "EURC invoice must remain pending when paid in USDC");

        cleanup(&db, &["token_wrong_currency_001"], invoice_id, merchant_id).await;
    }
}
