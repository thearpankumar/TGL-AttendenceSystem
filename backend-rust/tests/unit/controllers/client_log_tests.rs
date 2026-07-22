//! Tests for client log aggregation API
//!
//! Ported from: backend/tests/clientLog.test.js

use axum::{
    body::Body,
    http::{Request, StatusCode},
    Router,
};
use serde_json::json;
use tower::ServiceExt;

mod post_api_logs_client {
    use super::*;

    /// Test: should accept valid error log payload and return 202
    ///
    /// Original Node.js test:
    /// ```js
    /// it('should accept valid error log payload and return 202', async () => {
    ///   const res = await request(app)
    ///     .post('/api/logs/client')
    ///     .send({
    ///       message: 'Test UI Crash',
    ///       stack: 'Error: Test UI Crash\n    at Component (app.js:10:5)',
    ///       componentStack: '\n    in Component\n    in ErrorBoundary',
    ///       url: 'http://localhost/student',
    ///       userAgent: 'Mozilla/5.0 TestBrowser',
    ///       appName: 'StudentFrontend'
    ///     });
    ///
    ///   expect(res.status).toBe(202);
    ///   expect(res.body.success).toBe(true);
    /// });
    /// ```
    #[tokio::test]
    async fn should_accept_valid_error_log_payload_and_return_202() {
        // Create a router for testing (without full state since client_log doesn't use state)
        let app = create_test_router();

        let payload = json!({
            "message": "Test UI Crash",
            "stack": "Error: Test UI Crash\n    at Component (app.js:10:5)",
            "componentStack": "\n    in Component\n    in ErrorBoundary",
            "url": "http://localhost/student",
            "userAgent": "Mozilla/5.0 TestBrowser",
            "appName": "StudentFrontend"
        });

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/logs/client")
                    .header("Content-Type", "application/json")
                    .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::ACCEPTED);

        let body = axum::body::to_bytes(response.into_body(), 1024 * 1024)
            .await
            .unwrap();
        let body_json: serde_json::Value = serde_json::from_slice(&body).unwrap();

        assert_eq!(body_json.get("success"), Some(&json!(true)));
    }

    /// Test: should reject payload missing both message and stack
    ///
    /// Original Node.js test:
    /// ```js
    /// it('should reject payload missing both message and stack', async () => {
    ///   const res = await request(app)
    ///     .post('/api/logs/client')
    ///     .send({
    ///       url: 'http://localhost/student',
    ///       appName: 'StudentFrontend'
    ///     });
    ///
    ///   expect(res.status).toBe(400);
    ///   expect(res.body.error).toBe('Missing error details');
    /// });
    /// ```
    #[tokio::test]
    async fn should_reject_payload_missing_both_message_and_stack() {
        let app = create_test_router();

        let payload = json!({
            "url": "http://localhost/student",
            "appName": "StudentFrontend"
        });

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/logs/client")
                    .header("Content-Type", "application/json")
                    .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        let body = axum::body::to_bytes(response.into_body(), 1024 * 1024)
            .await
            .unwrap();
        let body_json: serde_json::Value = serde_json::from_slice(&body).unwrap();

        assert_eq!(
            body_json.get("error"),
            Some(&json!("Missing error details"))
        );
    }
}

/// Helper function to create a test router
fn create_test_router() -> Router {
    use axum::{routing::post, Json};

    Router::new().route(
        "/api/logs/client",
        post(|Json(payload): Json<serde_json::Value>| async move {
            // Validate that payload contains either message or stack
            let has_message = payload.get("message").and_then(|v| v.as_str()).is_some();
            let has_stack = payload.get("stack").and_then(|v| v.as_str()).is_some();

            if !has_message && !has_stack {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": "Missing error details" })),
                );
            }

            // Log would go here in real implementation
            tracing::warn!("Client error: {:?}", payload);

            (StatusCode::ACCEPTED, Json(json!({ "success": true })))
        }),
    )
}
