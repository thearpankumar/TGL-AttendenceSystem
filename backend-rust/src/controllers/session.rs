use axum::{
    extract::{Json, Path, Query, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Extension,
};
use chrono::{DateTime, Utc};
use mongodb::{
    bson::{doc, oid::ObjectId},
    Collection,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::{
    constants::*,
    error::{AppError, Result},
    middleware::{
        validators::{validate_request, SessionCreateRequest},
        AuthenticatedAdmin,
    },
    models::{Admin, Attendance, Batch, Location, Session, ShortLink},
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionRequest {
    pub location_id: String,
    pub batch_id: Option<String>,
    pub description: Option<String>,
    #[serde(alias = "durationMinutes", alias = "expiresInHours")]
    pub duration_minutes: Option<i32>,
    pub shortlink_mode: Option<String>,
    pub custom_short_code: Option<String>,
    pub existing_short_code: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SessionResponse {
    #[serde(rename = "_id")]
    pub id: String,
    pub token: String,
    #[serde(rename = "locationId")]
    pub location_id: String,
    #[serde(rename = "locationName")]
    pub location_name: Option<String>,
    #[serde(rename = "batchId")]
    pub batch_id: Option<String>,
    #[serde(rename = "batchName")]
    pub batch_name: Option<String>,
    pub description: Option<String>,
    #[serde(rename = "isActive")]
    pub is_active: bool,
    #[serde(rename = "expiresAt")]
    pub expires_at: DateTime<Utc>,
    #[serde(rename = "tokenPrefix")]
    pub token_prefix: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(rename = "attendanceCount")]
    pub attendance_count: Option<i64>,
    #[serde(rename = "shortCode")]
    pub short_code: Option<String>,
}

pub async fn create_session(
    State(state): State<Arc<crate::AppState>>,
    Extension(auth): Extension<AuthenticatedAdmin>,
    Json(payload): Json<CreateSessionRequest>,
) -> Result<impl IntoResponse> {
    let validation_req = SessionCreateRequest {
        location_id: payload.location_id.clone(),
        duration_minutes: payload.duration_minutes,
        batch_id: payload.batch_id.clone(),
        description: payload.description.clone(),
    };
    validate_request(&validation_req)?;

    let db_name = state
        .config
        .mongodb_uri
        .split('/')
        .next_back()
        .unwrap_or("default")
        .split('?')
        .next()
        .unwrap_or("default");

    let db = state.db.database(db_name);
    let collection: Collection<Session> = db.collection(Session::collection_name());
    let shortlink_collection: Collection<ShortLink> = db.collection(ShortLink::collection_name());

    let mode = payload.shortlink_mode.as_deref().unwrap_or("auto");

    // Pre-validate short link requirements before creating session
    let custom_code_to_use = if mode == "custom" {
        let code = payload
            .custom_short_code
            .as_deref()
            .unwrap_or("")
            .trim()
            .to_lowercase();
        if code.len() < 3
            || code.len() > 20
            || !code.chars().all(|c| c.is_alphanumeric() || c == '-')
        {
            return Err(AppError::BadRequest(
                "Custom short code must be 3-20 alphanumeric characters or hyphens".to_string(),
            ));
        }
        let existing = shortlink_collection
            .find_one(doc! { "shortCode": &code })
            .await?;
        if existing.is_some() {
            return Err(AppError::BadRequest(format!(
                "Short link '/s/{}' is already taken. Please choose another custom code.",
                code
            )));
        }
        Some(code)
    } else {
        None
    };

    let existing_code_to_use = if mode == "existing" {
        let code = payload.existing_short_code.as_deref().unwrap_or("").trim();
        if code.is_empty() {
            return Err(AppError::BadRequest(
                "Please select an existing short link".to_string(),
            ));
        }
        let existing = shortlink_collection
            .find_one(doc! { "shortCode": code })
            .await?;
        if existing.is_none() {
            return Err(AppError::NotFound(format!(
                "Existing short link '/s/{}' not found",
                code
            )));
        }
        Some(code.to_string())
    } else {
        None
    };

    let location_id = ObjectId::parse_str(&payload.location_id)
        .map_err(|e| AppError::BadRequest(format!("Invalid location ID: {}", e)))?;

    let batch_id = payload
        .batch_id
        .and_then(|id| ObjectId::parse_str(&id).ok());

    let token = Session::generate_token();
    let duration_minutes = payload.duration_minutes.unwrap_or(30) as i64;
    let expires_at = Utc::now() + chrono::Duration::minutes(duration_minutes);

    let session = Session {
        id: None,
        location_id,
        batch_id,
        token_hash: Session::hash_token(&token),
        token_prefix: Session::get_token_prefix(&token),
        description: payload.description,
        created_by: auth.id,
        is_active: true,
        expires_at,
        rotation_count: 0,
        totp_secret: Some(Session::generate_totp_secret()),
        created_at: Utc::now(),
    };

    let result = collection.insert_one(&session).await?;
    let session_id = result
        .inserted_id
        .as_object_id()
        .ok_or_else(|| AppError::Internal("Failed to get inserted ID".to_string()))?;

    // Atomically create or assign short link
    let created_short_code = match mode {
        "custom" => {
            let code = custom_code_to_use.unwrap();
            let short_link = ShortLink {
                id: None,
                short_code: code.clone(),
                session_id: Some(session_id),
                created_by: auth.id,
                is_active: true,
                expires_at: Some(session.expires_at),
                click_count: 0,
                last_clicked_at: None,
                created_at: Utc::now(),
            };
            if let Err(e) = shortlink_collection.insert_one(&short_link).await {
                let _ = collection.delete_one(doc! { "_id": session_id }).await;
                return Err(AppError::Internal(format!(
                    "Failed to create short link: {}",
                    e
                )));
            }
            code
        }
        "existing" => {
            let code = existing_code_to_use.unwrap();
            let update_res = shortlink_collection
                .update_one(
                    doc! { "shortCode": &code },
                    doc! {
                        "$set": {
                            "sessionId": session_id,
                            "isActive": true,
                            "expiresAt": mongodb::bson::DateTime::from_millis(session.expires_at.timestamp_millis()),
                        }
                    },
                )
                .await;
            if let Err(e) = update_res {
                let _ = collection.delete_one(doc! { "_id": session_id }).await;
                return Err(AppError::Internal(format!(
                    "Failed to attach short link: {}",
                    e
                )));
            }
            code
        }
        _ => {
            let mut attempts = 0;
            let code = loop {
                let candidate = ShortLink::generate_short_code(6);
                let existing = shortlink_collection
                    .find_one(doc! { "shortCode": &candidate })
                    .await?;
                if existing.is_none() {
                    break candidate;
                }
                attempts += 1;
                if attempts > 10 {
                    let _ = collection.delete_one(doc! { "_id": session_id }).await;
                    return Err(AppError::Internal(
                        "Failed to generate unique short code".to_string(),
                    ));
                }
            };
            let short_link = ShortLink {
                id: None,
                short_code: code.clone(),
                session_id: Some(session_id),
                created_by: auth.id,
                is_active: true,
                expires_at: Some(session.expires_at),
                click_count: 0,
                last_clicked_at: None,
                created_at: Utc::now(),
            };
            if let Err(e) = shortlink_collection.insert_one(&short_link).await {
                let _ = collection.delete_one(doc! { "_id": session_id }).await;
                return Err(AppError::Internal(format!(
                    "Failed to create short link: {}",
                    e
                )));
            }
            code
        }
    };

    let location = state
        .database()
        .collection(Location::collection_name())
        .find_one(doc! { "_id": location_id })
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(SessionResponse {
            id: session_id.to_hex(),
            token,
            location_id: payload.location_id,
            location_name: location
                .as_ref()
                .map(|l: &crate::models::Location| l.name.clone()),
            batch_id: session.batch_id.map(|b| b.to_hex()),
            batch_name: None,
            description: session.description,
            is_active: true,
            expires_at: session.expires_at,
            token_prefix: Some(session.token_prefix),
            created_at: Some(session.created_at),
            attendance_count: Some(0),
            short_code: Some(created_short_code),
        }),
    ))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetSessionsQuery {
    #[serde(alias = "location_id")]
    pub location_id: Option<String>,
    pub date: Option<String>,
}

pub async fn get_sessions(
    State(state): State<Arc<crate::AppState>>,
    Extension(_auth): Extension<AuthenticatedAdmin>,
    Query(query): Query<GetSessionsQuery>,
) -> Result<impl IntoResponse> {
    let db = state.database();
    let sessions: Collection<Session> = db.collection(Session::collection_name());
    let locations: Collection<Location> = db.collection(Location::collection_name());
    let attendances: Collection<Attendance> = db.collection(Attendance::collection_name());
    let batches: Collection<Batch> = db.collection(Batch::collection_name());

    let mut filter_doc = doc! {};

    if let Some(ref loc_id_str) = query.location_id {
        let trimmed = loc_id_str.trim();
        if !trimmed.is_empty() {
            if let Ok(loc_oid) = ObjectId::parse_str(trimmed) {
                filter_doc.insert("locationId", loc_oid);
            }
        }
    }

    if let Some(ref date_str) = query.date {
        let trimmed = date_str.trim();
        if !trimmed.is_empty() {
            if let Ok(naive_date) = chrono::NaiveDate::parse_from_str(trimmed, "%Y-%m-%d") {
                if let Some(start_of_day) = naive_date.and_hms_opt(0, 0, 0) {
                    if let Some(end_of_day) = naive_date.and_hms_opt(23, 59, 59) {
                        let start_utc =
                            DateTime::<Utc>::from_naive_utc_and_offset(start_of_day, Utc);
                        let end_utc = DateTime::<Utc>::from_naive_utc_and_offset(end_of_day, Utc);
                        filter_doc.insert("createdAt", doc! {
                            "$gte": mongodb::bson::DateTime::from_millis(start_utc.timestamp_millis()),
                            "$lte": mongodb::bson::DateTime::from_millis(end_utc.timestamp_millis()),
                        });
                    }
                }
            }
        }
    }

    let shortlinks: Collection<ShortLink> = db.collection(ShortLink::collection_name());
    let mut cursor = sessions
        .find(filter_doc)
        .sort(doc! { "createdAt": -1 })
        .limit(DASHBOARD_PAGE_SIZE)
        .await?;
    let mut sessions_list = Vec::new();

    while cursor.advance().await? {
        let session = cursor.deserialize_current()?;

        let location = locations
            .find_one(doc! { "_id": session.location_id })
            .await?;

        let batch = if let Some(batch_id) = session.batch_id {
            batches.find_one(doc! { "_id": batch_id }).await?
        } else {
            None
        };

        let attendance_count = attendances
            .count_documents(doc! { "sessionId": session.id })
            .await?;

        let short_link = if let Some(sid) = session.id {
            shortlinks
                .find_one(doc! { "sessionId": sid, "isActive": true })
                .await?
        } else {
            None
        };

        sessions_list.push(SessionResponse {
            id: session
                .id
                .ok_or_else(|| AppError::Internal("No ID".to_string()))?
                .to_hex(),
            token: String::new(),
            location_id: session.location_id.to_hex(),
            location_name: location.map(|l| l.name),
            batch_id: session.batch_id.map(|b| b.to_hex()),
            batch_name: batch.map(|b| b.name),
            description: session.description,
            is_active: session.is_active,
            expires_at: session.expires_at,
            token_prefix: Some(session.token_prefix),
            created_at: Some(session.created_at),
            attendance_count: Some(attendance_count as i64),
            short_code: short_link.map(|s| s.short_code),
        });
    }

    Ok(Json(sessions_list))
}

pub async fn get_session(
    State(state): State<Arc<crate::AppState>>,
    Extension(_auth): Extension<AuthenticatedAdmin>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let db = state.database();
    let sessions: Collection<Session> = db.collection(Session::collection_name());
    let locations: Collection<Location> = db.collection(Location::collection_name());
    let batches: Collection<Batch> = db.collection(Batch::collection_name());
    let attendances: Collection<Attendance> = db.collection(Attendance::collection_name());
    let shortlinks: Collection<ShortLink> = db.collection(ShortLink::collection_name());

    let session_id = ObjectId::parse_str(&id)
        .map_err(|e| AppError::BadRequest(format!("Invalid session ID: {}", e)))?;

    let session = sessions
        .find_one(doc! { "_id": session_id })
        .await?
        .ok_or_else(|| AppError::NotFound("Session not found".to_string()))?;

    let location = locations
        .find_one(doc! { "_id": session.location_id })
        .await?;

    let batch = if let Some(batch_id) = session.batch_id {
        batches.find_one(doc! { "_id": batch_id }).await?
    } else {
        None
    };

    let attendance_count = attendances
        .count_documents(doc! { "sessionId": session.id })
        .await?;

    let short_link = shortlinks
        .find_one(doc! { "sessionId": session.id, "isActive": true })
        .await?;

    Ok(Json(SessionResponse {
        id: session
            .id
            .ok_or_else(|| AppError::Internal("No ID".to_string()))?
            .to_hex(),
        token: String::new(),
        location_id: session.location_id.to_hex(),
        location_name: location.map(|l| l.name),
        batch_id: session.batch_id.map(|b| b.to_hex()),
        batch_name: batch.map(|b| b.name),
        description: session.description,
        is_active: session.is_active,
        expires_at: session.expires_at,
        token_prefix: Some(session.token_prefix),
        created_at: Some(session.created_at),
        attendance_count: Some(attendance_count as i64),
        short_code: short_link.map(|s| s.short_code),
    }))
}

pub async fn deactivate_session(
    State(state): State<Arc<crate::AppState>>,
    Extension(_auth): Extension<AuthenticatedAdmin>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let collection: Collection<Session> = state
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
        .collection(Session::collection_name());

    let session_id = ObjectId::parse_str(&id)
        .map_err(|e| AppError::BadRequest(format!("Invalid session ID: {}", e)))?;

    collection
        .update_one(
            doc! { "_id": session_id },
            doc! { "$set": { "isActive": false } },
        )
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

/// Request body for deleting a session (requires password re-verification)
#[derive(Debug, Deserialize)]
pub struct DeleteSessionRequest {
    pub password: String,
}

/// Delete a session with password re-verification
/// This is a destructive operation that requires the admin to re-enter their password
pub async fn delete_session(
    State(state): State<Arc<crate::AppState>>,
    Extension(auth): Extension<AuthenticatedAdmin>,
    Path(id): Path<String>,
    Json(payload): Json<DeleteSessionRequest>,
) -> Result<impl IntoResponse> {
    let db = state.database();

    let sessions: Collection<Session> = db.collection(Session::collection_name());
    let attendances: Collection<Attendance> = db.collection(Attendance::collection_name());
    let admins: Collection<Admin> = db.collection(Admin::collection_name());
    let short_links: Collection<ShortLink> = db.collection(ShortLink::collection_name());

    // Parse session ID
    let session_id = ObjectId::parse_str(&id)
        .map_err(|e| AppError::BadRequest(format!("Invalid session ID: {}", e)))?;

    // First verify session ownership (so cross-admin deletions get 404, not 401)
    let _session = sessions
        .find_one(doc! { "_id": session_id, "createdBy": auth.id })
        .await?
        .ok_or_else(|| AppError::NotFound("Session not found".to_string()))?;

    // Verify password - re-fetch admin with password field
    let admin = admins
        .find_one(doc! { "_id": auth.id })
        .await?
        .ok_or_else(|| AppError::Unauthorized("Admin not found".to_string()))?;

    // Verify the password using Admin::verify_password()
    let password_valid = admin
        .verify_password(&payload.password)
        .map_err(|e| AppError::Internal(format!("Password verification failed: {}", e)))?;

    if !password_valid {
        return Err(AppError::Unauthorized("Incorrect password".to_string()));
    }

    // Find all attendance records with photos before deleting them
    let mut attendance_cursor = attendances
        .find(doc! {
            "sessionId": session_id,
            "photoPublicId": { "$exists": true, "$ne": "" }
        })
        .projection(doc! { "photoPublicId": 1 })
        .await?;

    let mut photo_ids_to_delete = Vec::new();
    while attendance_cursor.advance().await? {
        let attendance: Attendance = attendance_cursor.deserialize_current()?;
        if !attendance.photo_public_id.is_empty() {
            photo_ids_to_delete.push(attendance.photo_public_id.clone());
        }
    }

    // Drop cursor to release any remaining resources
    drop(attendance_cursor);

    // Delete photos from storage
    for public_id in &photo_ids_to_delete {
        match state.storage.provider().delete(public_id).await {
            Ok(_) => {}
            Err(e) => {
                tracing::warn!("Failed to delete photo {}: {}", public_id, e);
            }
        }
    }

    // Delete all attendance records for this session
    attendances
        .delete_many(doc! { "sessionId": session_id })
        .await?;

    // Detach any short links that pointed to this session so they can be reattached
    short_links
        .update_many(
            doc! { "sessionId": session_id },
            doc! { "$set": { "sessionId": null, "isActive": false } },
        )
        .await?;

    // Delete the session
    sessions.delete_one(doc! { "_id": session_id }).await?;

    Ok((
        StatusCode::OK,
        Json(serde_json::json!({
            "success": true,
            "message": "Session and all attendance records deleted successfully"
        })),
    ))
}

pub async fn rotate_token(
    State(state): State<Arc<crate::AppState>>,
    Extension(_auth): Extension<AuthenticatedAdmin>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let collection: Collection<Session> = state
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
        .collection(Session::collection_name());

    let session_id = ObjectId::parse_str(&id)
        .map_err(|e| AppError::BadRequest(format!("Invalid session ID: {}", e)))?;

    let session = collection
        .find_one(doc! { "_id": session_id })
        .await?
        .ok_or_else(|| AppError::NotFound("Session not found".to_string()))?;

    let new_token = Session::generate_token();

    collection
        .update_one(
            doc! { "_id": session_id },
            doc! {
                "$set": {
                    "tokenHash": Session::hash_token(&new_token),
                    "tokenPrefix": Session::get_token_prefix(&new_token),
                    "totpSecret": Session::generate_totp_secret(),
                    "rotationCount": session.rotation_count + 1
                }
            },
        )
        .await?;

    Ok(Json(serde_json::json!({ "token": new_token })))
}

#[derive(Debug, Deserialize)]
pub struct ExportQuery {
    pub format: Option<String>,
}

pub async fn export_session_attendance(
    State(state): State<Arc<crate::AppState>>,
    Extension(auth): Extension<AuthenticatedAdmin>,
    Path(id): Path<String>,
    Query(_query): Query<ExportQuery>,
) -> Result<impl IntoResponse> {
    let db = state.database();

    let sessions: Collection<Session> = db.collection(Session::collection_name());
    let attendances: Collection<Attendance> = db.collection(Attendance::collection_name());
    let locations: Collection<Location> = db.collection(Location::collection_name());
    let batches: Collection<Batch> = db.collection(Batch::collection_name());

    let session_id = ObjectId::parse_str(&id)
        .map_err(|e| AppError::BadRequest(format!("Invalid session ID: {}", e)))?;

    let session = sessions
        .find_one(doc! { "_id": session_id, "createdBy": auth.id })
        .await?
        .ok_or_else(|| AppError::NotFound("Session not found".to_string()))?;

    let location = locations
        .find_one(doc! { "_id": session.location_id })
        .await?
        .ok_or_else(|| AppError::NotFound("Location not found".to_string()))?;

    let batch = if let Some(batch_id) = session.batch_id {
        batches.find_one(doc! { "_id": batch_id }).await?
    } else {
        None
    };

    let mut cursor = attendances
        .find(doc! { "sessionId": session_id })
        .sort(doc! { "capturedAt": 1 })
        .await?;

    let mut attendance_data: Vec<AttendanceExportRow> = Vec::new();

    while cursor.advance().await? {
        let attendance = cursor.deserialize_current()?;
        attendance_data.push(AttendanceExportRow {
            roll_number: attendance.roll_number.clone(),
            student_name: attendance.student_name.clone(),
            verified: attendance.verified,
            distance: attendance.distance_from_location,
            captured_at: attendance.captured_at.to_rfc3339(),
            webauthn_verified: attendance.webauthn_verified,
            device_flag: None,
        });
    }

    if let Some(ref batch) = batch {
        attendance_data = merge_with_batch(attendance_data, batch, &session, &location);
    }

    let excel_data = generate_excel(&attendance_data, &session, &location, batch.as_ref())?;

    let filename = format!(
        "attendance_{}_{}.xlsx",
        session_id.to_hex(),
        Utc::now().format("%Y%m%d_%H%M%S")
    );

    Ok((
        StatusCode::OK,
        [
            (
                header::CONTENT_TYPE,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".to_string(),
            ),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{}\"", filename),
            ),
        ],
        excel_data,
    ))
}

#[derive(Debug, Serialize)]
pub struct AttendanceExportRow {
    pub roll_number: String,
    pub student_name: String,
    pub verified: bool,
    pub distance: f64,
    pub captured_at: String,
    pub webauthn_verified: bool,
    pub device_flag: Option<String>,
}

fn merge_with_batch(
    attendance: Vec<AttendanceExportRow>,
    batch: &Batch,
    _session: &Session,
    _location: &Location,
) -> Vec<AttendanceExportRow> {
    let mut result = Vec::new();
    let submitted: std::collections::HashMap<String, &AttendanceExportRow> = attendance
        .iter()
        .map(|a| (a.roll_number.to_uppercase(), a))
        .collect();

    for student in &batch.students {
        if let Some(att) = submitted.get(&student.roll_number.to_uppercase()) {
            result.push(AttendanceExportRow {
                roll_number: att.roll_number.clone(),
                student_name: att.student_name.clone(),
                verified: att.verified,
                distance: att.distance,
                captured_at: att.captured_at.clone(),
                webauthn_verified: att.webauthn_verified,
                device_flag: att.device_flag.clone(),
            });
        } else {
            result.push(AttendanceExportRow {
                roll_number: student.roll_number.clone(),
                student_name: student.name.clone(),
                verified: false,
                distance: 0.0,
                captured_at: String::new(),
                webauthn_verified: false,
                device_flag: Some("ABSENT".to_string()),
            });
        }
    }

    result
}

fn generate_excel(
    data: &[AttendanceExportRow],
    session: &Session,
    location: &Location,
    batch: Option<&Batch>,
) -> Result<Vec<u8>> {
    use rust_xlsxwriter::Workbook;

    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();

    worksheet
        .write_string(0, 0, "Roll Number")
        .map_err(|e| AppError::Internal(format!("Excel error: {}", e)))?;
    worksheet
        .write_string(0, 1, "Student Name")
        .map_err(|e| AppError::Internal(format!("Excel error: {}", e)))?;
    worksheet
        .write_string(0, 2, "Status")
        .map_err(|e| AppError::Internal(format!("Excel error: {}", e)))?;
    worksheet
        .write_string(0, 3, "Verified")
        .map_err(|e| AppError::Internal(format!("Excel error: {}", e)))?;
    worksheet
        .write_string(0, 4, "Distance (m)")
        .map_err(|e| AppError::Internal(format!("Excel error: {}", e)))?;
    worksheet
        .write_string(0, 5, "Captured At")
        .map_err(|e| AppError::Internal(format!("Excel error: {}", e)))?;
    worksheet
        .write_string(0, 6, "WebAuthn")
        .map_err(|e| AppError::Internal(format!("Excel error: {}", e)))?;
    worksheet
        .write_string(0, 7, "Device Flag")
        .map_err(|e| AppError::Internal(format!("Excel error: {}", e)))?;

    let mut row = 1u32;
    for record in data {
        let status = if record
            .device_flag
            .as_ref()
            .map(|f| f == "ABSENT")
            .unwrap_or(false)
        {
            "Absent"
        } else if record.verified {
            "Present"
        } else {
            "Pending"
        };

        worksheet
            .write_string(row, 0, &record.roll_number)
            .map_err(|e| AppError::Internal(format!("Excel error: {}", e)))?;
        worksheet
            .write_string(row, 1, &record.student_name)
            .map_err(|e| AppError::Internal(format!("Excel error: {}", e)))?;
        worksheet
            .write_string(row, 2, status)
            .map_err(|e| AppError::Internal(format!("Excel error: {}", e)))?;
        worksheet
            .write_string(row, 3, if record.verified { "Yes" } else { "No" })
            .map_err(|e| AppError::Internal(format!("Excel error: {}", e)))?;
        worksheet
            .write_number(row, 4, record.distance)
            .map_err(|e| AppError::Internal(format!("Excel error: {}", e)))?;
        worksheet
            .write_string(row, 5, &record.captured_at)
            .map_err(|e| AppError::Internal(format!("Excel error: {}", e)))?;
        worksheet
            .write_string(
                row,
                6,
                if record.webauthn_verified {
                    "Yes"
                } else {
                    "No"
                },
            )
            .map_err(|e| AppError::Internal(format!("Excel error: {}", e)))?;
        worksheet
            .write_string(row, 7, record.device_flag.as_deref().unwrap_or(""))
            .map_err(|e| AppError::Internal(format!("Excel error: {}", e)))?;
        row += 1;
    }

    worksheet
        .write_string(row + 2, 0, "Session Information")
        .map_err(|e| AppError::Internal(format!("Excel error: {}", e)))?;
    worksheet
        .write_string(row + 3, 0, "Location:")
        .map_err(|e| AppError::Internal(format!("Excel error: {}", e)))?;
    worksheet
        .write_string(row + 3, 1, &location.name)
        .map_err(|e| AppError::Internal(format!("Excel error: {}", e)))?;
    worksheet
        .write_string(row + 4, 0, "Session ID:")
        .map_err(|e| AppError::Internal(format!("Excel error: {}", e)))?;
    worksheet
        .write_string(
            row + 4,
            1,
            session.id.map(|id| id.to_hex()).unwrap_or_default(),
        )
        .map_err(|e| AppError::Internal(format!("Excel error: {}", e)))?;
    worksheet
        .write_string(row + 5, 0, "Description:")
        .map_err(|e| AppError::Internal(format!("Excel error: {}", e)))?;
    worksheet
        .write_string(row + 5, 1, session.description.as_deref().unwrap_or(""))
        .map_err(|e| AppError::Internal(format!("Excel error: {}", e)))?;

    if let Some(b) = batch {
        worksheet
            .write_string(row + 6, 0, "Batch:")
            .map_err(|e| AppError::Internal(format!("Excel error: {}", e)))?;
        worksheet
            .write_string(row + 6, 1, &b.name)
            .map_err(|e| AppError::Internal(format!("Excel error: {}", e)))?;
    }

    worksheet.autofit();

    let data = workbook
        .save_to_buffer()
        .map_err(|e| AppError::Internal(format!("Excel generation failed: {}", e)))?;

    Ok(data)
}
