use crate::{processor, Config};
use anyhow::Result;
use backoff::{future::retry, ExponentialBackoff};
use redis::aio::MultiplexedConnection;
use reqwest::header::ACCEPT;
use serde::Deserialize;
use sqlx::PgPool;

#[derive(Clone, Debug, Deserialize)]
pub struct HorizonPayment {
    pub paging_token: String,
    pub id: String,
    pub from: String,
    pub to: String,
    pub amount: String,
    pub asset_type: Option<String>,
    pub asset_code: Option<String>,
    pub asset_issuer: Option<String>,
    pub transaction_hash: String,
    pub ledger: i64,
    pub transaction_successful: Option<bool>,
    pub memo: Option<String>,
}

pub async fn run_with_backoff(db: PgPool, redis: MultiplexedConnection, config: Config, cursor: String) -> Result<()> {
    retry(ExponentialBackoff::default(), || async {
        run_stream(db.clone(), redis.clone(), config.clone(), cursor.clone())
            .await
            .map_err(backoff::Error::transient)
    })
    .await
}

async fn run_stream(db: PgPool, mut redis: MultiplexedConnection, config: Config, cursor: String) -> Result<()> {
    let url = format!(
        "{}/accounts/{}/payments?cursor={}&streaming=on",
        config.horizon_url, config.treasury, cursor
    );
    let body = reqwest::Client::new()
        .get(url)
        .header(ACCEPT, "text/event-stream")
        .send()
        .await?
        .text()
        .await?;

    for line in body.lines().filter(|line| line.starts_with("data: ")) {
        let payload = line.trim_start_matches("data: ");
        if payload == "hello" {
            continue;
        }
        let payment: HorizonPayment = serde_json::from_str(payload)?;
        processor::process_payment(&db, &mut redis, &payment, &config).await?;
    }
    Ok(())
}
