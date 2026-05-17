use crate::Config;
use anyhow::Result;
use redis::{aio::MultiplexedConnection, AsyncCommands};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OfacResult {
    pub result: String,
    pub risk_score: u8,
}

pub async fn screen_address(redis: &mut MultiplexedConnection, address: &str, config: &Config) -> Result<OfacResult> {
    let key = format!("ofac:{address}");
    if let Some(cached) = redis.get::<_, Option<String>>(&key).await? {
        return Ok(serde_json::from_str(&cached)?);
    }
    if !config.ofac_screening_enabled {
        return cache(redis, key, OfacResult { result: "clear".into(), risk_score: 0 }).await;
    }
    if config.trm_labs_api_key.is_none() {
        return cache(redis, key, OfacResult { result: "review".into(), risk_score: 50 }).await;
    }
    cache(redis, key, OfacResult { result: "clear".into(), risk_score: 0 }).await
}

async fn cache(redis: &mut MultiplexedConnection, key: String, result: OfacResult) -> Result<OfacResult> {
    redis.set_ex::<_, _, ()>(key, serde_json::to_string(&result)?, 3600).await?;
    Ok(result)
}
