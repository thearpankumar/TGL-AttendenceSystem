use axum::{routing::post, Json, Router};
use std::sync::Arc;

use crate::AppState;

pub fn create_routes(state: Arc<AppState>) -> Router<Arc<AppState>> {
    Router::new().route("/", post(log_client_error))
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            crate::middleware::client_log_rate_limit_middleware,
        ))
}

async fn log_client_error(
    Json(payload): Json<serde_json::Value>,
) -> impl axum::response::IntoResponse {
    tracing::warn!("Client error: {:?}", payload);
    Json(serde_json::json!({ "logged": true }))
}
