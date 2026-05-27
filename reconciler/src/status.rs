use anyhow::Result;
use redis::{aio::MultiplexedConnection, AsyncCommands};
use serde_json::json;
use std::net::SocketAddr;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

/// Starts a minimal HTTP server on `addr` that serves `GET /status`.
/// The reconciler status is read from Redis key `reconciler:status`.
pub async fn serve(addr: SocketAddr, mut redis: MultiplexedConnection) -> Result<()> {
    let listener = TcpListener::bind(addr).await?;
    tracing::info!("reconciler status HTTP server listening on {addr}");
    loop {
        let (mut stream, _) = listener.accept().await?;
        let mut redis = redis.clone();
        tokio::spawn(async move {
            let mut buf = [0u8; 512];
            if stream.read(&mut buf).await.is_err() {
                return;
            }
            let req = String::from_utf8_lossy(&buf);
            let is_status = req.starts_with("GET /status");
            let body = if is_status {
                let status: String = redis
                    .get("reconciler:status")
                    .await
                    .unwrap_or_else(|_| "unknown".to_string());
                json!({ "status": status }).to_string()
            } else {
                json!({ "error": "not found" }).to_string()
            };
            let code = if is_status { "200 OK" } else { "404 Not Found" };
            let response = format!(
                "HTTP/1.1 {code}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            let _ = stream.write_all(response.as_bytes()).await;
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_body_is_valid_json() {
        let body = json!({ "status": "running" }).to_string();
        let parsed: serde_json::Value = serde_json::from_str(&body).unwrap();
        assert_eq!(parsed["status"], "running");
    }
}
