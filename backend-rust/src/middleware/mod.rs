pub mod validators;
pub mod csrf;

mod auth;
mod device_check;
mod device_fingerprint;
mod device_integrity;
mod device_trust;
mod emulator_detection;
mod gps_validation;
mod mobile_check;
mod rate_limiter;
mod rate_limit_middleware;
mod security_extractors;
mod session_cache;

pub use validators::*;
pub use auth::*;
pub use csrf::{csrf_middleware, generate_csrf_token, validate_csrf_token};
pub use device_check::{DeviceCheckResult, device_check_middleware};
pub use device_fingerprint::{check_device_blocked, record_device_success};
pub use mobile_check::{mobile_check_middleware, check_mobile, detect_ua_spoofing, DeviceInfo};
pub use rate_limiter::RateLimiter;
pub use rate_limit_middleware::{
    login_rate_limit_middleware,
    admin_rate_limit_middleware,
    student_rate_limit_middleware,
};
pub use session_cache::{SessionCache, CachedSession, get_or_fetch_session};
pub use security_extractors::{
    DeviceIntegrityResult, EmulatorDetectionResult,
    GpsValidationResult, GpsDataPayload,
    gps_validation_middleware, emulator_detection_middleware,
    device_integrity_middleware,
};
pub use gps_validation::{
    GpsAnomalyResult,
    check_position_jump,
    check_gps_accuracy,
    check_gps_speed,
    check_mock_location,
    check_suspicious_accuracy,
    check_altitude_issue,
    check_timestamp_drift,
    check_provider_mismatch,
};
pub use device_trust::{DeviceTrustScore, get_device_trust_score, update_device_trust, flag_suspicious_device};
