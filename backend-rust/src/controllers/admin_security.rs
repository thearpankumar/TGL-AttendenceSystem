use axum::{
    extract::{Json, Path, State},
    response::IntoResponse,
    Extension,
};
use chrono::Utc;
use mongodb::{
    bson::{doc, oid::ObjectId, DateTime as BsonDateTime},
    Collection,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::{
    error::{AppError, Result},
    middleware::AuthenticatedAdmin,
    models::{Attendance, SystemConfig},
};

#[derive(Debug, Serialize)]
pub struct UnreviewedFlagsSummary {
    #[serde(rename = "gpsAnomalies")]
    pub gps_anomalies: i64,
    #[serde(rename = "emulatorDetected")]
    pub emulator_detected: i64,
    #[serde(rename = "integrityIssues")]
    pub integrity_issues: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecuritySummary {
    pub total_submissions: i64,
    pub flagged_submissions: i64,
    pub unreviewed_flags: UnreviewedFlagsSummary,
    pub flag_percentage: String,
}

pub async fn get_security_summary(
    State(state): State<Arc<crate::AppState>>,
    Extension(_auth): Extension<AuthenticatedAdmin>,
    Path(session_id): Path<String>,
) -> Result<impl IntoResponse> {
    let attendances: Collection<Attendance> = state
        .db
        .database(
            state
                .config
                .mongodb_uri
                .split('/')
                .next_back()
                .unwrap_or("default")
                .split('?')
                .next()
                .unwrap_or("default"),
        )
        .collection(Attendance::collection_name());

    let session_oid = ObjectId::parse_str(&session_id)
        .map_err(|e| AppError::BadRequest(format!("Invalid session ID: {}", e)))?;

    let total_submissions = attendances
        .count_documents(doc! { "sessionId": session_oid })
        .await?;

    let flagged_submissions = attendances
        .count_documents(doc! { "sessionId": session_oid, "flagged": true })
        .await?;

    let unreviewed_gps = attendances
        .count_documents(doc! {
            "sessionId": session_oid,
            "flagged": true,
            "flagReviewed": false,
            "$or": [
                { "gpsAnomalies": { "$exists": true, "$not": { "$size": 0 } } },
                { "gpsMockLocation": true }
            ]
        })
        .await?;

    let unreviewed_emulator = attendances
        .count_documents(doc! {
            "sessionId": session_oid,
            "flagged": true,
            "flagReviewed": false,
            "emulatorDetected": true
        })
        .await?;

    let unreviewed_integrity = attendances
        .count_documents(doc! {
            "sessionId": session_oid,
            "flagged": true,
            "flagReviewed": false,
            "integrityChecks": { "$exists": true, "$not": { "$size": 0 } }
        })
        .await?;

    let flag_percentage = if total_submissions > 0 {
        format!(
            "{:.1}%",
            (flagged_submissions as f64 / total_submissions as f64) * 100.0
        )
    } else {
        "0.0%".to_string()
    };

    Ok(Json(SecuritySummary {
        total_submissions: total_submissions as i64,
        flagged_submissions: flagged_submissions as i64,
        unreviewed_flags: UnreviewedFlagsSummary {
            gps_anomalies: unreviewed_gps as i64,
            emulator_detected: unreviewed_emulator as i64,
            integrity_issues: unreviewed_integrity as i64,
        },
        flag_percentage,
    }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewSubmissionRequest {
    pub action: String, // "approve" or "reject"
    pub notes: Option<String>,
}

pub async fn review_submission(
    State(state): State<Arc<crate::AppState>>,
    Extension(auth): Extension<AuthenticatedAdmin>,
    Path(attendance_id): Path<String>,
    Json(payload): Json<ReviewSubmissionRequest>,
) -> Result<impl IntoResponse> {
    let attendances: Collection<Attendance> = state
        .db
        .database(
            state
                .config
                .mongodb_uri
                .split('/')
                .next_back()
                .unwrap_or("default")
                .split('?')
                .next()
                .unwrap_or("default"),
        )
        .collection(Attendance::collection_name());

    let attendance_oid = ObjectId::parse_str(&attendance_id)
        .map_err(|e| AppError::BadRequest(format!("Invalid attendance ID: {}", e)))?;

    // Verify attendance exists before reviewing
    let _existing = attendances
        .find_one(doc! { "_id": attendance_oid })
        .await?
        .ok_or_else(|| AppError::NotFound("Attendance record not found".to_string()))?;

    let message = match payload.action.as_str() {
        "approve" => {
            // Clear flags, mark verified
            attendances
                .update_one(
                    doc! { "_id": attendance_oid },
                    doc! {
                        "$set": {
                            "flagged": false,
                            "flagReviewed": true,
                            "flagReviewedBy": auth.id,
                            "flagReviewedAt": BsonDateTime::now(),
                            "flagNotes": payload.notes,
                            "verified": true,
                        }
                    },
                )
                .await?;

            // TODO: Update device trust score (when device_trust is available)

            "Attendance submission approved and verified successfully"
        }
        "reject" => {
            // Keep flagged, mark reviewed
            attendances
                .update_one(
                    doc! { "_id": attendance_oid },
                    doc! {
                        "$set": {
                            "flagReviewed": true,
                            "flagReviewedBy": auth.id,
                            "flagReviewedAt": BsonDateTime::now(),
                            "flagNotes": payload.notes,
                            "verified": false,
                        }
                    },
                )
                .await?;

            "Attendance submission rejected and marked as unverified"
        }
        _ => {
            return Err(AppError::BadRequest(
                "Invalid action. Use 'approve' or 'reject'".to_string(),
            ));
        }
    };

    Ok(Json(serde_json::json!({
        "success": true,
        "message": message,
        "attendance_id": attendance_id,
        "action": payload.action,
        "reviewed_by": auth.id.to_hex(),
    })))
}

pub async fn get_flagged_submissions(
    State(state): State<Arc<crate::AppState>>,
    Extension(_auth): Extension<AuthenticatedAdmin>,
    Path(session_id): Path<String>,
) -> Result<impl IntoResponse> {
    let attendances: Collection<Attendance> = state
        .db
        .database(
            state
                .config
                .mongodb_uri
                .split('/')
                .next_back()
                .unwrap_or("default")
                .split('?')
                .next()
                .unwrap_or("default"),
        )
        .collection(Attendance::collection_name());

    let session_oid = ObjectId::parse_str(&session_id)
        .map_err(|e| AppError::BadRequest(format!("Invalid session ID: {}", e)))?;

    let mut cursor = attendances
        .find(doc! { "sessionId": session_oid, "flagged": true })
        .limit(100)
        .await?;
    let mut submissions = Vec::new();

    while cursor.advance().await? {
        let a = cursor.deserialize_current()?;
        submissions.push(serde_json::json!({
            "id": a.id.unwrap().to_hex(),
            "studentName": a.student_name,
            "rollNumber": a.roll_number,
            "deviceFlag": a.device_flag,
            "flagReviewed": a.flag_reviewed,
            "capturedAt": a.captured_at,
        }));
    }

    Ok(Json(submissions))
}

// =================== Submission Details ===================

#[derive(Debug, Serialize)]
pub struct SubmissionDetailsResponse {
    pub attendance: AttendanceDetails,
    pub location: LocationDetails,
    pub gps: GpsDetails,
    pub emulator: EmulatorDetails,
    pub integrity: IntegrityDetails,
    pub has_security_data: bool,
}

#[derive(Debug, Serialize)]
pub struct AttendanceDetails {
    pub id: String,
    pub roll_number: String,
    pub student_name: String,
    pub captured_at: chrono::DateTime<chrono::Utc>,
    pub flagged: bool,
    pub flag_reason: Option<String>,
    pub flag_reviewed: bool,
    pub flag_reviewed_by: Option<String>,
    pub flag_reviewed_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Serialize)]
pub struct LocationDetails {
    pub latitude: f64,
    pub longitude: f64,
    pub distance_from_location: f64,
}

#[derive(Debug, Serialize)]
pub struct GpsDetails {
    pub accuracy: Option<f64>,
    pub altitude: Option<f64>,
    pub speed: Option<f64>,
    pub heading: Option<f64>,
    pub provider: Option<String>,
    pub mock_location: bool,
    pub confidence: Option<String>,
    pub anomalies: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct EmulatorDetails {
    pub detected: bool,
    pub flags: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct IntegrityDetails {
    pub checks: Vec<serde_json::Value>,
}

pub async fn get_submission_details(
    State(state): State<Arc<crate::AppState>>,
    Extension(_auth): Extension<AuthenticatedAdmin>,
    Path(attendance_id): Path<String>,
) -> Result<impl IntoResponse> {
    let db = state.db.database(
        state
            .config
            .mongodb_uri
            .split('/')
            .next_back()
            .unwrap_or("default")
            .split('?')
            .next()
            .unwrap_or("default"),
    );

    let attendances: Collection<Attendance> = db.collection(Attendance::collection_name());

    let attendance_oid = ObjectId::parse_str(&attendance_id)
        .map_err(|e| AppError::BadRequest(format!("Invalid attendance ID: {}", e)))?;

    let attendance = attendances
        .find_one(doc! { "_id": attendance_oid })
        .await?
        .ok_or_else(|| AppError::NotFound("Attendance record not found".to_string()))?;

    let has_security_data = !attendance.gps_anomalies.is_empty()
        || !attendance.emulator_flags.is_empty()
        || !attendance.integrity_checks.is_empty()
        || attendance.gps_accuracy.is_some();

    let details = SubmissionDetailsResponse {
        attendance: AttendanceDetails {
            id: attendance_id,
            roll_number: attendance.roll_number,
            student_name: attendance.student_name,
            captured_at: attendance.captured_at,
            flagged: attendance.flagged,
            flag_reason: attendance.flag_reason,
            flag_reviewed: attendance.flag_reviewed,
            flag_reviewed_by: attendance.flag_reviewed_by.map(|id| id.to_hex()),
            flag_reviewed_at: attendance.flag_reviewed_at,
        },
        location: LocationDetails {
            latitude: attendance.student_latitude,
            longitude: attendance.student_longitude,
            distance_from_location: attendance.distance_from_location,
        },
        gps: GpsDetails {
            accuracy: attendance.gps_accuracy,
            altitude: attendance.gps_altitude,
            speed: attendance.gps_speed,
            heading: attendance.gps_heading,
            provider: attendance.gps_provider,
            mock_location: attendance.gps_mock_location,
            confidence: attendance
                .gps_confidence
                .map(|c| format!("{:?}", c).to_lowercase()),
            anomalies: attendance
                .gps_anomalies
                .iter()
                .map(|a| {
                    serde_json::json!({
                        "type": format!("{:?}", a.anomaly_type),
                        "severity": a.severity,
                        "details": a.details,
                        "detectedAt": a.detected_at,
                    })
                })
                .collect(),
        },
        emulator: EmulatorDetails {
            detected: attendance.emulator_detected,
            flags: attendance
                .emulator_flags
                .iter()
                .map(|f| {
                    serde_json::json!({
                        "type": format!("{:?}", f.flag_type),
                        "severity": f.severity,
                        "details": f.details,
                    })
                })
                .collect(),
        },
        integrity: IntegrityDetails {
            checks: attendance
                .integrity_checks
                .iter()
                .map(|c| {
                    serde_json::json!({
                        "type": format!("{:?}", c.check_type),
                        "details": c.details,
                    })
                })
                .collect(),
        },
        has_security_data,
    };

    Ok(Json(details))
}

// =================== Security Settings ===================

#[derive(Debug, Serialize)]
pub struct SecuritySettingsResponse {
    pub gps_validation: crate::models::GpsValidationConfig,
    pub emulator_detection: crate::models::EmulatorDetectionConfig,
    pub trust_score: crate::models::TrustScoreConfig,
}

pub async fn get_security_settings(
    State(state): State<Arc<crate::AppState>>,
    Extension(_auth): Extension<AuthenticatedAdmin>,
) -> Result<impl IntoResponse> {
    let db = state.db.database(
        state
            .config
            .mongodb_uri
            .split('/')
            .next_back()
            .unwrap_or("default")
            .split('?')
            .next()
            .unwrap_or("default"),
    );

    let configs: Collection<SystemConfig> = db.collection(SystemConfig::collection_name());

    let config = configs.find_one(doc! {}).await?.unwrap_or_default();

    Ok(Json(SecuritySettingsResponse {
        gps_validation: config.gps_validation,
        emulator_detection: config.emulator_detection,
        trust_score: config.trust_score,
    }))
}

#[derive(Debug, Deserialize)]
pub struct UpdateSecuritySettingsRequest {
    pub gps_validation: Option<crate::models::GpsValidationConfig>,
    pub emulator_detection: Option<crate::models::EmulatorDetectionConfig>,
    pub trust_score: Option<crate::models::TrustScoreConfig>,
}

pub async fn update_security_settings(
    State(state): State<Arc<crate::AppState>>,
    Extension(auth): Extension<AuthenticatedAdmin>,
    Json(payload): Json<UpdateSecuritySettingsRequest>,
) -> Result<impl IntoResponse> {
    let db = state.db.database(
        state
            .config
            .mongodb_uri
            .split('/')
            .next_back()
            .unwrap_or("default")
            .split('?')
            .next()
            .unwrap_or("default"),
    );

    let configs: Collection<SystemConfig> = db.collection(SystemConfig::collection_name());

    let mut config = configs.find_one(doc! {}).await?.unwrap_or_default();

    if let Some(gps) = payload.gps_validation {
        config.gps_validation = gps;
    }
    if let Some(emu) = payload.emulator_detection {
        config.emulator_detection = emu;
    }
    if let Some(trust) = payload.trust_score {
        config.trust_score = trust;
    }

    config.updated_by = Some(auth.id);
    config.updated_at = Utc::now();

    configs
        .update_one(
            doc! {},
            doc! { "$set": mongodb::bson::to_document(&config).map_err(|e| AppError::Internal(e.to_string()))? },
        )
        .upsert(true)
        .await?;

    Ok(Json(serde_json::json!({
        "message": "Security settings updated",
        "config": {
            "gpsValidation": config.gps_validation,
            "emulatorDetection": config.emulator_detection,
            "trustScore": config.trust_score,
        }
    })))
}
