use axum::{
    routing::{get, post},
    Router,
};
use std::sync::Arc;
use tower::ServiceBuilder;

use crate::middleware::{
    device_check_middleware, device_integrity_middleware, emulator_detection_middleware,
    gps_validation_middleware, mobile_check_middleware, student_rate_limit_middleware,
};
use crate::AppState;

pub fn create_routes(state: Arc<AppState>) -> Router<Arc<AppState>> {
    Router::new()
        .route("/{shortCode}", get(crate::controllers::resolve_short_link))
        .route(
            "/{shortCode}/session",
            get(crate::controllers::get_short_link_session),
        )
        .route(
            "/{shortCode}/upload-url",
            get(crate::controllers::get_shortlink_upload_url),
        )
        .route(
            "/{shortCode}/captcha",
            get(crate::controllers::get_shortlink_captcha),
        )
        .route(
            "/{shortCode}/submit",
            post(crate::controllers::submit_shortlink_attendance),
        )
        .route(
            "/{shortCode}/webauthn/status/{rollNumber}",
            get(crate::controllers::get_webauthn_status),
        )
        .route(
            "/{shortCode}/webauthn/register/start",
            post(crate::controllers::start_registration),
        )
        .route(
            "/{shortCode}/webauthn/register/finish",
            post(crate::controllers::finish_registration),
        )
        .route(
            "/{shortCode}/webauthn/authenticate/start",
            post(crate::controllers::start_authentication),
        )
        .route(
            "/{shortCode}/webauthn/authenticate/conditional",
            post(crate::controllers::start_conditional_authentication),
        )
        .route(
            "/{shortCode}/webauthn/authenticate/finish",
            post(crate::controllers::finish_authentication),
        )
        .layer(
            ServiceBuilder::new()
                .layer(axum::middleware::from_fn(mobile_check_middleware))
                .layer(axum::middleware::from_fn(gps_validation_middleware))
                .layer(axum::middleware::from_fn(emulator_detection_middleware))
                .layer(axum::middleware::from_fn(device_integrity_middleware))
                .layer(axum::middleware::from_fn_with_state(
                    state.clone(),
                    device_check_middleware,
                ))
                .layer(axum::middleware::from_fn_with_state(
                    state.clone(),
                    student_rate_limit_middleware,
                )),
        )
}
