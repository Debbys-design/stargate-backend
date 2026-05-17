mod compliance;
mod matcher;
mod metrics;
mod processor;
mod stream;

use anyhow::{Context, Result};
use redis::AsyncCommands;
use sqlx::PgPool;
use tracing_subscriber::EnvFilter;

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub redis_url: String,
    pub horizon_url: String,
    pub treasury: String,
    pub asset_code: String,
    pub asset_issuer: String,
    pub ofac_screening_enabled: bool,
    pub trm_labs_api_key: Option<String>,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        dotenvy::dotenv().ok();
        let get = |key: &str| std::env::var(key).with_context(|| format!("{key} is required"));
        Ok(Self {
            database_url: get("DATABASE_URL")?,
            redis_url: get("REDIS_URL")?,
            horizon_url: get("HORIZON_URL")?,
            treasury: get("PLATFORM_TREASURY_PUBLIC_KEY")?,
            asset_code: std::env::var("STELLAR_ASSET_CODE").unwrap_or_else(|_| "USDC".to_string()),
            asset_issuer: get("STELLAR_ASSET_ISSUER")?,
            ofac_screening_enabled: std::env::var("OFAC_SCREENING_ENABLED").unwrap_or_else(|_| "true".into()) == "true",
            trm_labs_api_key: std::env::var("TRM_LABS_API_KEY").ok(),
        })
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt().with_env_filter(EnvFilter::from_default_env()).init();
    let config = Config::from_env()?;
    let db = PgPool::connect(&config.database_url).await?;
    let client = redis::Client::open(config.redis_url.clone())?;
    let mut redis = client.get_multiplexed_async_connection().await?;
    let cursor: Option<String> = sqlx::query_scalar("SELECT value FROM reconciler_state WHERE key='cursor'")
        .fetch_optional(&db)
        .await?;
    let cursor = cursor.unwrap_or_else(|| std::env::var("RECONCILER_CURSOR").unwrap_or_else(|_| "now".to_string()));
    redis.set::<_, _, ()>("reconciler:status", "running").await?;
    stream::run_with_backoff(db, redis, config, cursor).await
}
