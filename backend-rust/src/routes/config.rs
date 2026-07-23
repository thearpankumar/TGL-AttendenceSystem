use axum::{
    extract::State,
    routing::{get, post},
    Extension, Json, Router,
};
use mongodb::{bson::doc, Collection};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::error::{AppError, Result};
use crate::middleware::AuthenticatedAdmin;
use crate::models::SystemConfig;
use crate::AppState;

use crate::middleware::auth_middleware;

pub fn create_routes(state: Arc<AppState>) -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(get_config).put(update_config))
        .route("/dev-bypass", post(toggle_dev_bypass))
        .route("/defaults", get(get_config_defaults))
        .route_layer(axum::middleware::from_fn_with_state(state, auth_middleware))
}

async fn get_config(
    State(state): State<Arc<AppState>>,
    Extension(_admin): Extension<AuthenticatedAdmin>,
) -> Result<impl axum::response::IntoResponse> {
    // Return the hot-reload cached config — fast path
    let config = state.get_system_config().await;
    Ok(Json(config))
}

async fn update_config(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthenticatedAdmin>,
    Json(mut payload): Json<SystemConfig>,
) -> Result<impl axum::response::IntoResponse> {
    use chrono::Utc;

    let db_name = state
        .config
        .mongodb_uri
        .split('/')
        .next_back()
        .unwrap_or("default").split('?').next().unwrap_or("default");

    let configs: Collection<SystemConfig> = state
        .db
        .database(db_name)
        .collection(SystemConfig::collection_name());

    payload.updated_by = Some(auth.id);
    payload.updated_at = Utc::now();
    // Preserve the existing DB _id
    let existing = configs.find_one(doc! {}).await?.unwrap_or_default();
    payload.id = existing.id;

    configs
        .update_one(
            doc! {},
            doc! { "$set": mongodb::bson::to_document(&payload).map_err(|e| AppError::Internal(e.to_string()))? },
        )
        .upsert(true)
        .await?;

    // Flush in-memory hot-reload cache
    state.set_system_config(payload.clone()).await;

    Ok(Json(serde_json::json!({
        "message": "System configuration saved successfully",
        "config": payload
    })))
}

async fn get_config_defaults(
    Extension(_admin): Extension<AuthenticatedAdmin>,
) -> Result<impl axum::response::IntoResponse> {
    Ok(Json(SystemConfig::default()))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DevBypassRequest {
    enabled: bool,
    password: String,
}

#[derive(Debug, Serialize)]
struct DevBypassResponse {
    message: String,
    config: SystemConfig,
}

async fn toggle_dev_bypass(
    State(state): State<Arc<AppState>>,
    Extension(auth_admin): Extension<AuthenticatedAdmin>,
    Json(payload): Json<DevBypassRequest>,
) -> Result<impl axum::response::IntoResponse> {
    use chrono::Utc;

    let db_name = state
        .config
        .mongodb_uri
        .split('/')
        .next_back()
        .unwrap_or("default").split('?').next().unwrap_or("default");

    let admins: Collection<crate::models::Admin> = state
        .db
        .database(db_name)
        .collection(crate::models::Admin::collection_name());

    let admin = admins
        .find_one(doc! { "_id": auth_admin.id })
        .await?
        .ok_or_else(|| AppError::Unauthorized("Admin not found".to_string()))?;

    if !admin.verify_password(&payload.password)? {
        return Err(AppError::Unauthorized("Invalid password".to_string()));
    }

    let configs: Collection<SystemConfig> = state
        .db
        .database(db_name)
        .collection(SystemConfig::collection_name());

    let mut config = configs
        .find_one(doc! {})
        .await?
        .unwrap_or_else(SystemConfig::default);

    config.dev_bypass_enabled = payload.enabled;
    config.updated_by = Some(auth_admin.id);
    config.updated_at = Utc::now();

    configs
        .update_one(
            doc! {},
            doc! { "$set": mongodb::bson::to_document(&config).map_err(|e| AppError::Internal(e.to_string()))? },
        )
        .upsert(true)
        .await?;

    // Flush hot-reload cache
    state.set_system_config(config.clone()).await;

    Ok(Json(DevBypassResponse {
        message: "Developer Bypass Mode updated successfully".to_string(),
        config,
    }))
}



