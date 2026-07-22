//! Rate limiter tests ported from backend/tests/rateLimiter.test.js
//!
//! Tests cover:
//! - Rate limit enforcement when max requests exceeded
//! - Test environment skip behavior
//! - Build store fallback behavior (is_redis_enabled)
//!
//! Original Node.js tests:
//! 1. 'returns 429 once the login limiter max is exceeded within the window'
//! 2. 'does not limit when left at the default isTest() skip (NODE_ENV=test)'
//! 3. 'falls back to the in-memory store when Redis is not connected'

#[cfg(test)]
mod tests {
    use attendance_geotag_backend::middleware::RateLimiter;
    use serial_test::serial;
    use std::sync::Arc;

    /// Test module for rate limiter enforcement
    /// Port of: describe('rate limiter enforcement', ...)
    mod rate_limiter_enforcement {
        use super::*;

        /// Test: returns 429 once the login limiter max is exceeded within the window
        /// Port of: it('returns 429 once the login limiter max is exceeded within the window', ...)
        ///
        /// Original Node.js test behavior:
        /// - createLoginLimiter({ skip: () => false }) creates a limiter with skip disabled
        /// - Makes 6 requests (max is 5, RATE_LIMIT_LOGIN_MAX)
        /// - The 6th request returns 429 with message "Too many login attempts, please try again later"
        ///
        /// In Rust, we test the RateLimiter::check_rate_limit function directly:
        /// - Force NODE_ENV to non-test to enable rate limiting
        /// - Verify that after RATE_LIMIT_LOGIN_MAX requests, subsequent requests are blocked
        #[tokio::test]
        #[serial]
        async fn returns_429_once_login_limiter_max_exceeded_within_window() {
            // Create a rate limiter without Redis (in-memory store)
            // Equivalent to createLoginLimiter({ skip: () => false }) in Node.js
            let rate_limiter = Arc::new(RateLimiter::new());

            // Temporarily disable test environment to enable rate limiting
            // In Node.js, NODE_ENV=test skips rate limiting
            // In Rust, NODE_ENV=test also skips rate limiting
            std::env::set_var("NODE_ENV", "development");

            let test_ip = "192.168.1.100";

            // RATE_LIMIT_LOGIN_MAX = 5
            // Make requests up to and beyond the limit
            let mut results = Vec::new();

            for i in 0..6 {
                let allowed = rate_limiter.login_rate_limit(test_ip).await;
                results.push((i + 1, allowed));
            }

            // Restore test environment
            std::env::set_var("NODE_ENV", "test");

            // First 5 requests should be allowed (requests 1-5)
            for (request_num, allowed) in &results[..5] {
                assert!(
                    *allowed,
                    "Request {} should be allowed (within rate limit)",
                    request_num
                );
            }

            // The 6th request should be blocked (rate limit exceeded)
            // This corresponds to the 429 response in Node.js
            let (request_num, blocked) = results[5];
            assert!(
                !blocked,
                "Request {} should be blocked (rate limit exceeded, equivalent to HTTP 429)",
                request_num
            );
        }

        /// Test: does not limit when left at the default isTest() skip (NODE_ENV=test)
        /// Port of: it('does not limit when left at the default isTest() skip (NODE_ENV=test)', ...)
        ///
        /// Original Node.js test behavior:
        /// - createLoginLimiter() without skip option uses default isTest() check
        /// - In NODE_ENV=test environment, rate limiting is skipped
        /// - 10 parallel requests all return 200 OK
        ///
        /// In Rust:
        /// - Set NODE_ENV=test or NODE_ENV=test
        /// - RateLimiter::check_rate_limit returns true (skips limiting)
        /// - All requests pass through
        #[tokio::test]
        #[serial]
        async fn does_not_limit_when_left_at_default_is_test_skip() {
            // Create rate limiter with default behavior
            let rate_limiter = Arc::new(RateLimiter::new());

            // Set test environment (equivalent to NODE_ENV=test in Node.js)
            std::env::set_var("NODE_ENV", "test");

            let test_ip = "192.168.1.101";

            // Make 10 parallel requests - all should succeed
            // because test environment skips rate limiting
            let mut handles = vec![];

            for _ in 0..10 {
                let limiter = Arc::clone(&rate_limiter);
                let ip = test_ip.to_string();

                handles.push(tokio::spawn(
                    async move { limiter.login_rate_limit(&ip).await },
                ));
            }

            // Wait for all requests
            let results: Vec<bool> = futures::future::join_all(handles)
                .await
                .into_iter()
                .map(|r| r.unwrap())
                .collect();

            std::env::set_var("NODE_ENV", "test");

            // All results should be true (rate limiting skipped)
            // Equivalent to all HTTP responses being 200 OK
            for (idx, allowed) in results.iter().enumerate() {
                assert!(
                    *allowed,
                    "Request {} should be allowed (test environment skips rate limiting)",
                    idx + 1
                );
            }
        }

        /// Test: NODE_ENV=test also works for skipping rate limiting
        #[tokio::test]
        #[serial]
        async fn node_env_test_also_skips_rate_limiting() {
            let rate_limiter = Arc::new(RateLimiter::new());

            // Set NODE_ENV=test (Node.js compatibility)
            std::env::set_var("NODE_ENV", "test");

            let test_ip = "192.168.1.102";

            // Make multiple requests - all should succeed
            for i in 0..10 {
                let allowed = rate_limiter.login_rate_limit(test_ip).await;
                assert!(
                    allowed,
                    "Request {} should be allowed with NODE_ENV=test",
                    i + 1
                );
            }

            std::env::set_var("NODE_ENV", "test");
        }
    }

    /// Test module for buildStore functionality
    /// Port of: describe('buildStore', ...)
    mod build_store {
        use super::*;

        /// Test: falls back to the in-memory store when Redis is not connected
        /// Port of: it('falls back to the in-memory store when Redis is not connected', ...)
        ///
        /// Original Node.js test behavior:
        /// - buildStore('rl:test:') is called
        /// - Since Redis is not initialized in test environment, returns undefined
        /// - This indicates the fallback to in-memory store
        ///
        /// In Rust:
        /// - RateLimiter::new() creates a limiter without Redis
        /// - is_redis_enabled() returns false
        /// - This indicates fallback to in-memory HashMap store
        #[test]
        fn falls_back_to_in_memory_store_when_redis_not_connected() {
            // Create a rate limiter without Redis (in-memory store)
            // Equivalent to buildStore('rl:test:') returning undefined in Node.js
            let limiter = RateLimiter::new();

            // Verify Redis is not enabled
            // In Node.js, buildStore returns undefined when Redis is not connected
            // In Rust, is_redis_enabled() returns false for the same condition
            assert!(
                !limiter.is_redis_enabled(),
                "Expected Redis to be disabled when not connected (equivalent to buildStore returning undefined in Node.js)"
            );
        }

        /// Test: RateLimiter::with_redis(None) also falls back to memory store
        #[test]
        fn with_redis_none_falls_back_to_in_memory_store() {
            let limiter = RateLimiter::with_redis(None);

            assert!(
                !limiter.is_redis_enabled(),
                "Expected Redis to be disabled when None is passed to with_redis"
            );
        }
    }

    /// Additional edge case tests for rate limiter behavior
    mod rate_limiter_edge_cases {
        use super::*;

        /// Test: different IPs have independent rate limits
        /// Verifies that rate limiting is per-IP, not global
        #[tokio::test]
        #[serial]
        async fn different_ips_have_independent_rate_limits() {
            // Disable test environment to enable rate limiting
            std::env::set_var("NODE_ENV", "development");
            std::env::set_var("NODE_ENV", "development");

            let limiter = Arc::new(RateLimiter::new());

            // IP 1: exhaust rate limit (5 requests max)
            for _ in 0..10 {
                limiter.login_rate_limit("10.0.0.1").await;
            }

            // IP 2: should still be allowed (independent counter)
            let allowed = limiter.login_rate_limit("10.0.0.2").await;
            assert!(allowed, "Different IP should have independent rate limit");

            std::env::set_var("NODE_ENV", "test");
        }

        /// Test: rate limit counters are keyed by type
        /// Login, admin, student, registration, and clientlog have separate counters
        #[tokio::test]
        #[serial]
        async fn different_rate_limit_types_are_independent() {
            std::env::set_var("NODE_ENV", "development");
            std::env::set_var("NODE_ENV", "development");

            let limiter = Arc::new(RateLimiter::new());
            let ip = "10.0.0.3";

            // Exhaust login rate limit
            for _ in 0..10 {
                limiter.login_rate_limit(ip).await;
            }

            // Admin rate limit should still work (independent type)
            let allowed = limiter.admin_rate_limit(ip).await;
            assert!(
                allowed,
                "Different rate limit type should have independent counter"
            );

            std::env::set_var("NODE_ENV", "test");
        }

        /// Test: rate limit allows exactly ROUTE_LIMIT_LOGIN_MAX requests
        /// Login limit is 5 requests per 900 seconds
        #[tokio::test]
        #[serial]
        async fn login_rate_limit_allows_exactly_five_requests() {
            std::env::set_var("NODE_ENV", "development");
            std::env::set_var("NODE_ENV", "development");

            let limiter = Arc::new(RateLimiter::new());
            let ip = "10.0.0.4";

            // First 5 requests should be allowed
            for i in 0..5 {
                let allowed = limiter.login_rate_limit(ip).await;
                assert!(
                    allowed,
                    "Request {} should be allowed (within 5 request limit)",
                    i + 1
                );
            }

            // 6th request should be blocked
            let blocked = limiter.login_rate_limit(ip).await;
            assert!(!blocked, "6th request should be blocked");

            std::env::set_var("NODE_ENV", "test");
        }

        /// Test: admin rate limit allows ROUTE_LIMIT_ADMIN_MAX (100) requests
        #[tokio::test]
        #[serial]
        async fn admin_rate_limit_allows_hundred_requests() {
            std::env::set_var("NODE_ENV", "development");
            std::env::set_var("NODE_ENV", "development");

            let limiter = Arc::new(RateLimiter::new());
            let ip = "10.0.0.5";

            // First 100 requests should be allowed
            for i in 0..100 {
                let allowed = limiter.admin_rate_limit(ip).await;
                assert!(
                    allowed,
                    "Admin request {} should be allowed (within 100 request limit)",
                    i + 1
                );
            }

            // 101st request should be blocked
            let blocked = limiter.admin_rate_limit(ip).await;
            assert!(!blocked, "Admin request 101 should be blocked");

            std::env::set_var("NODE_ENV", "test");
        }

        /// Test: student rate limit allows ROUTE_LIMIT_STUDENT_MAX (20) requests
        #[tokio::test]
        #[serial]
        async fn student_rate_limit_allows_twenty_requests() {
            std::env::set_var("NODE_ENV", "development");
            std::env::set_var("NODE_ENV", "development");

            let limiter = Arc::new(RateLimiter::new());
            let ip = "10.0.0.6";

            // First 20 requests should be allowed
            for i in 0..20 {
                let allowed = limiter.student_rate_limit(ip).await;
                assert!(
                    allowed,
                    "Student request {} should be allowed (within 20 request limit)",
                    i + 1
                );
            }

            // 21st request should be blocked
            let blocked = limiter.student_rate_limit(ip).await;
            assert!(!blocked, "Student request 21 should be blocked");

            std::env::set_var("NODE_ENV", "test");
        }

        /// Test: registration rate limit allows ROUTE_LIMIT_REGISTRATION_MAX (5) requests
        #[tokio::test]
        #[serial]
        async fn registration_rate_limit_allows_five_requests() {
            std::env::set_var("NODE_ENV", "development");
            std::env::set_var("NODE_ENV", "development");

            let limiter = Arc::new(RateLimiter::new());
            let ip = "10.0.0.7";

            // First 5 requests should be allowed
            for i in 0..5 {
                let allowed = limiter.registration_rate_limit(ip).await;
                assert!(
                    allowed,
                    "Registration request {} should be allowed (within 5 request limit)",
                    i + 1
                );
            }

            // 6th request should be blocked
            let blocked = limiter.registration_rate_limit(ip).await;
            assert!(!blocked, "Registration request 6 should be blocked");

            std::env::set_var("NODE_ENV", "test");
        }

        /// Test: client log rate limit allows ROUTE_LIMIT_CLIENTLOG_MAX (10) requests
        #[tokio::test]
        #[serial]
        async fn client_log_rate_limit_allows_ten_requests() {
            std::env::set_var("NODE_ENV", "development");
            std::env::set_var("NODE_ENV", "development");

            let limiter = Arc::new(RateLimiter::new());
            let ip = "10.0.0.8";

            // First 10 requests should be allowed
            for i in 0..10 {
                let allowed = limiter.client_log_rate_limit(ip).await;
                assert!(
                    allowed,
                    "Client log request {} should be allowed (within 10 request limit)",
                    i + 1
                );
            }

            // 11th request should be blocked
            let blocked = limiter.client_log_rate_limit(ip).await;
            assert!(!blocked, "Client log request 11 should be blocked");

            std::env::set_var("NODE_ENV", "test");
        }
    }
}
