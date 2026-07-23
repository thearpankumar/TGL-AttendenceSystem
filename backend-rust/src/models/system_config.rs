use chrono::{DateTime, Utc};
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

use crate::constants::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemConfig {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    #[serde(default)]
    pub dev_bypass_enabled: bool,
    #[serde(default)]
    pub gps_validation: GpsValidationConfig,
    #[serde(default)]
    pub emulator_detection: EmulatorDetectionConfig,
    #[serde(default)]
    pub trust_score: TrustScoreConfig,
    #[serde(default)]
    pub rate_limits: RateLimitsConfig,
    #[serde(default)]
    pub webauthn_config: WebAuthnSystemConfig,
    #[serde(default)]
    pub photo_verification: PhotoVerificationConfig,
    #[serde(default)]
    pub session_config: SessionConfig,
    #[serde(default)]
    pub lockout_config: LockoutConfig,
    #[serde(default)]
    pub attendance_config: AttendanceConfig,
    pub updated_by: Option<ObjectId>,
    #[serde(
        with = "bson::serde_helpers::datetime::FromChrono04DateTime",
        default = "chrono::Utc::now"
    )]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpsValidationConfig {
    #[serde(default = "default_accuracy_very_suspicious")]
    pub accuracy_very_suspicious: f64,
    #[serde(default = "default_accuracy_suspicious")]
    pub accuracy_suspicious: f64,
    #[serde(default = "default_speed_threshold")]
    pub speed_threshold: f64,
    #[serde(default = "default_60000")]
    pub timestamp_drift_max: i64,
    #[serde(default = "default_position_jump_threshold")]
    pub position_jump_threshold: f64,
    #[serde(default = "default_geofence_max_distance")]
    pub geofence_max_distance_m: f64,
    #[serde(default = "default_true")]
    pub altitude_zero_penalty: bool,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_accuracy_very_suspicious() -> f64 {
    GPS_ACCURACY_GOOD_THRESHOLD
}
fn default_accuracy_suspicious() -> f64 {
    GPS_ACCURACY_MEDIUM_THRESHOLD
}
fn default_speed_threshold() -> f64 {
    DEFAULT_SPEED_THRESHOLD
}
fn default_position_jump_threshold() -> f64 {
    POSITION_JUMP_THRESHOLD_M
}
fn default_geofence_max_distance() -> f64 {
    GEOGENCE_MAX_DISTANCE_M
}
fn default_60000() -> i64 {
    60000
}
fn default_true() -> bool {
    true
}

impl Default for GpsValidationConfig {
    fn default() -> Self {
        Self {
            accuracy_very_suspicious: GPS_ACCURACY_GOOD_THRESHOLD,
            accuracy_suspicious: GPS_ACCURACY_MEDIUM_THRESHOLD,
            speed_threshold: DEFAULT_SPEED_THRESHOLD,
            timestamp_drift_max: 60000,
            position_jump_threshold: POSITION_JUMP_THRESHOLD_M,
            geofence_max_distance_m: GEOGENCE_MAX_DISTANCE_M,
            altitude_zero_penalty: true,
            enabled: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmulatorDetectionConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub block_on_high_severity: bool,
}

impl Default for EmulatorDetectionConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            block_on_high_severity: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustScoreConfig {
    #[serde(default = "default_15")]
    pub anomaly_penalty: f64,
    #[serde(default = "default_10")]
    pub safe_review_bonus: f64,
}

fn default_15() -> f64 {
    15.0
}

fn default_10() -> f64 {
    10.0
}

impl Default for TrustScoreConfig {
    fn default() -> Self {
        Self {
            anomaly_penalty: 15.0,
            safe_review_bonus: 10.0,
        }
    }
}

impl Default for SystemConfig {
    fn default() -> Self {
        Self {
            id: None,
            dev_bypass_enabled: false,
            gps_validation: GpsValidationConfig::default(),
            emulator_detection: EmulatorDetectionConfig::default(),
            trust_score: TrustScoreConfig::default(),
            rate_limits: RateLimitsConfig::default(),
            webauthn_config: WebAuthnSystemConfig::default(),
            photo_verification: PhotoVerificationConfig::default(),
            session_config: SessionConfig::default(),
            lockout_config: LockoutConfig::default(),
            attendance_config: AttendanceConfig::default(),
            updated_by: None,
            updated_at: Utc::now(),
        }
    }
}

impl SystemConfig {
    pub fn collection_name() -> &'static str {
        "systemconfigs"
    }
}

// =================== Rate Limits Config ===================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RateLimitsConfig {
    #[serde(default = "default_rl_admin_window")]
    pub admin_window_secs: u64,
    #[serde(default = "default_rl_admin_max")]
    pub admin_max_requests: u32,
    #[serde(default = "default_rl_student_window")]
    pub student_window_secs: u64,
    #[serde(default = "default_rl_student_max")]
    pub student_max_requests: u32,
    #[serde(default = "default_rl_login_window")]
    pub login_window_secs: u64,
    #[serde(default = "default_rl_login_max")]
    pub login_max_requests: u32,
    #[serde(default = "default_rl_clientlog_window")]
    pub client_log_window_secs: u64,
    #[serde(default = "default_rl_clientlog_max")]
    pub client_log_max_requests: u32,
}

fn default_rl_admin_window() -> u64 { 60 }
fn default_rl_admin_max() -> u32 { 1000 }
fn default_rl_student_window() -> u64 { 60 }
fn default_rl_student_max() -> u32 { 100 }
fn default_rl_login_window() -> u64 { 60 }
fn default_rl_login_max() -> u32 { 20 }
fn default_rl_clientlog_window() -> u64 { 60 }
fn default_rl_clientlog_max() -> u32 { 100 }

impl Default for RateLimitsConfig {
    fn default() -> Self {
        Self {
            admin_window_secs: 60,
            admin_max_requests: 1000,
            student_window_secs: 60,
            student_max_requests: 100,
            login_window_secs: 60,
            login_max_requests: 20,
            client_log_window_secs: 60,
            client_log_max_requests: 100,
        }
    }
}

// =================== WebAuthn System Config ===================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebAuthnSystemConfig {
    #[serde(default = "default_webauthn_grace")]
    pub grace_period_minutes: i64,
}

fn default_webauthn_grace() -> i64 { 15 }

impl Default for WebAuthnSystemConfig {
    fn default() -> Self {
        Self { grace_period_minutes: 15 }
    }
}

// =================== Photo Verification Config ===================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoVerificationConfig {
    #[serde(default = "default_photo_low")]
    pub similarity_threshold: f32,
    #[serde(default = "default_photo_high")]
    pub high_similarity_threshold: f32,
}

fn default_photo_low() -> f32 { 0.15 }
fn default_photo_high() -> f32 { 0.85 }

impl Default for PhotoVerificationConfig {
    fn default() -> Self {
        Self {
            similarity_threshold: 0.15,
            high_similarity_threshold: 0.85,
        }
    }
}

// =================== Session Config ===================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfig {
    #[serde(default = "default_session_expire")]
    pub expire_minutes: u64,
}

fn default_session_expire() -> u64 { 60 }

impl Default for SessionConfig {
    fn default() -> Self {
        Self { expire_minutes: 60 }
    }
}

// =================== Lockout Config ===================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LockoutConfig {
    #[serde(default = "default_max_login_attempts")]
    pub max_login_attempts: u32,
    #[serde(default = "default_lockout_duration")]
    pub lockout_duration_minutes: u64,
}

fn default_max_login_attempts() -> u32 { 5 }
fn default_lockout_duration() -> u64 { 15 }

impl Default for LockoutConfig {
    fn default() -> Self {
        Self {
            max_login_attempts: 5,
            lockout_duration_minutes: 15,
        }
    }
}

// =================== Attendance Config ===================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttendanceConfig {
    #[serde(default = "default_max_attendance_attempts")]
    pub max_attendance_attempts: u32,
}

fn default_max_attendance_attempts() -> u32 { 3 }

impl Default for AttendanceConfig {
    fn default() -> Self {
        Self {
            max_attendance_attempts: 3,
        }
    }
}
