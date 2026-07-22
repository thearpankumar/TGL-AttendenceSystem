use axum::{
    extract::{Json, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Extension,
};
use chrono::{DateTime, Datelike, Duration, Utc};
use mongodb::{bson::{doc, DateTime as BsonDateTime}, Collection};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::{
    error::{AppError, Result},
    middleware::{
        validators::{validate_request, AdminLoginRequest, AdminRegisterRequest},
        generate_token, AuthenticatedAdmin,
    },
    models::{Admin, AdminLogin, AdminRegistration, Attendance, Batch, Location, Session},
};

#[derive(Debug, Serialize)]
pub struct AdminResponse {
    #[serde(rename = "_id")]
    pub id: String,
    pub username: String,
    pub email: String,
    pub role: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub expires_in: String,
    pub admin: AdminResponse,
}

pub async fn register(
    State(state): State<Arc<crate::AppState>>,
    Json(payload): Json<AdminRegistration>,
) -> Result<impl IntoResponse> {
    let validation_req = AdminRegisterRequest {
        username: payload.username.clone(),
        email: payload.email.clone(),
        password: payload.password.clone(),
        admin_secret: payload.admin_secret.clone(),
    };
    validate_request(&validation_req)?;

    if payload.admin_secret != state.config.admin_secret {
        return Err(AppError::Unauthorized("Invalid admin secret".to_string()));
    }

    let collection: Collection<Admin> = state
        .db
        .database(
            state
                .config
                .mongodb_uri
                .split('/')
                .next_back()
                .unwrap_or("default"),
        )
        .collection(Admin::collection_name());

    let existing = collection
        .find_one(doc! { "username": &payload.username })
        .await?;
    if existing.is_some() {
        return Err(AppError::BadRequest("Username already exists".to_string()));
    }

    let existing_email = collection
        .find_one(doc! { "email": &payload.email })
        .await?;
    if existing_email.is_some() {
        return Err(AppError::BadRequest("Email already exists".to_string()));
    }

    let hashed_password = Admin::hash_password(&payload.password)?;

    let admin = Admin {
        id: None,
        username: payload.username,
        email: payload.email,
        password: hashed_password,
        role: "admin".to_string(),
        failed_login_attempts: 0,
        lock_until: None,
        created_at: Utc::now(),
    };

    let result = collection.insert_one(&admin).await?;
    let admin_id = result
        .inserted_id
        .as_object_id()
        .ok_or_else(|| AppError::Internal("Failed to get inserted ID".to_string()))?;

    let token = generate_token(
        &admin_id,
        &state.config.jwt_secret,
        &state.config.jwt_expire,
    )?;

    Ok((
        StatusCode::CREATED,
        Json(LoginResponse {
            token,
            expires_in: state.config.jwt_expire.clone(),
            admin: AdminResponse {
                id: admin_id.to_hex(),
                username: admin.username,
                email: admin.email,
                role: admin.role,
            },
        }),
    ))
}

pub async fn login(
    State(state): State<Arc<crate::AppState>>,
    Json(payload): Json<AdminLogin>,
) -> Result<impl IntoResponse> {
    let validation_req = AdminLoginRequest {
        username: payload.username.clone(),
        password: payload.password.clone(),
    };
    validate_request(&validation_req)?;

    let collection: Collection<Admin> = state
        .db
        .database(
            state
                .config
                .mongodb_uri
                .split('/')
                .next_back()
                .unwrap_or("default"),
        )
        .collection(Admin::collection_name());

    let admin = collection
        .find_one(doc! { "username": &payload.username })
        .await?
        .ok_or_else(|| AppError::Unauthorized("Invalid credentials".to_string()))?;

    if admin.is_locked() {
        return Err(AppError::Unauthorized(
            "Account is locked. Try again later.".to_string(),
        ));
    }

    if !admin.verify_password(&payload.password)? {
        let attempts = admin.failed_login_attempts + 1;
        let lock_until = if attempts >= Admin::MAX_LOGIN_ATTEMPTS {
            Some(Utc::now() + Duration::minutes(Admin::LOCK_TIME_MINUTES))
        } else {
            None
        };

        collection
            .update_one(
                doc! { "_id": admin.id },
                doc! { "$set": { "failedLoginAttempts": attempts, "lockUntil": lock_until.map(|dt| BsonDateTime::from_millis(dt.timestamp_millis())) } },
            )
            .await?;

        return Err(AppError::Unauthorized("Invalid credentials".to_string()));
    }

    if admin.failed_login_attempts > 0 {
        collection
            .update_one(
                doc! { "_id": admin.id },
                doc! { "$set": { "failedLoginAttempts": 0, "lockUntil": null } },
            )
            .await?;
    }

    let admin_id = admin
        .id
        .ok_or_else(|| AppError::Internal("No admin ID".to_string()))?;

    if admin.should_rehash() {
        let new_hash = Admin::hash_password(&payload.password)?;
        collection
            .update_one(
                doc! { "_id": admin_id },
                doc! { "$set": { "password": new_hash } },
            )
            .await?;
    }
    let token = generate_token(
        &admin_id,
        &state.config.jwt_secret,
        &state.config.jwt_expire,
    )?;

    Ok(Json(LoginResponse {
        token,
        expires_in: state.config.jwt_expire.clone(),
        admin: AdminResponse {
            id: admin_id.to_hex(),
            username: admin.username,
            email: admin.email,
            role: admin.role,
        },
    }))
}

pub async fn get_profile(
    State(state): State<Arc<crate::AppState>>,
    Extension(auth): Extension<AuthenticatedAdmin>,
) -> Result<impl IntoResponse> {
    let collection: Collection<Admin> = state
        .db
        .database(
            state
                .config
                .mongodb_uri
                .split('/')
                .next_back()
                .unwrap_or("default"),
        )
        .collection(Admin::collection_name());

    let admin = collection
        .find_one(doc! { "_id": auth.id })
        .await?
        .ok_or_else(|| AppError::NotFound("Admin not found".to_string()))?;

    Ok(Json(AdminResponse {
        id: auth.id.to_hex(),
        username: admin.username,
        email: admin.email,
        role: admin.role,
    }))
}

#[derive(Debug, Deserialize)]
pub struct DashboardQuery {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub session_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DashboardStats {
    pub total_sessions: i64,
    pub active_sessions: i64,
    pub total_attendance: i64,
    pub verified_attendance: i64,
    pub flagged_count: i64,
}

pub async fn get_dashboard_stats(
    State(state): State<Arc<crate::AppState>>,
    Extension(_auth): Extension<AuthenticatedAdmin>,
    Query(_query): Query<DashboardQuery>,
) -> Result<impl IntoResponse> {
    let db = state
        .db
        .database(
            state
                .config
                .mongodb_uri
                .split('/')
                .next_back()
                .unwrap_or("default"),
        );

    let sessions_collection: Collection<Session> = db.collection(Session::collection_name());
    let attendance_collection: Collection<Attendance> = db.collection(Attendance::collection_name());

    let total_sessions = sessions_collection.estimated_document_count().await? as i64;
    let active_sessions = sessions_collection
        .count_documents(doc! { "isActive": true })
        .await? as i64;

    let total_attendance = attendance_collection.estimated_document_count().await? as i64;
    let verified_attendance = attendance_collection
        .count_documents(doc! { "verified": true })
        .await? as i64;
    let flagged_count = attendance_collection
        .count_documents(doc! { "flagged": true })
        .await? as i64;

    Ok(Json(DashboardStats {
        total_sessions,
        active_sessions,
        total_attendance,
        verified_attendance,
        flagged_count,
    }))
}

pub async fn get_system_health(
    State(state): State<Arc<crate::AppState>>,
    Extension(_auth): Extension<AuthenticatedAdmin>,
) -> Result<impl IntoResponse> {
    use crate::services::system_health::get_system_health as check_system_health;

    let health = check_system_health(&state.db, state.redis.as_ref()).await?;
    Ok(Json(health))
}

// Dashboard Filters
#[derive(Debug, Serialize)]
pub struct DashboardFilters {
    pub batches: Vec<FilterOption>,
    pub centers: Vec<FilterOption>,
    pub timeframes: Vec<String>,
    pub risk_levels: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct FilterOption {
    pub value: String,
    pub label: String,
}

pub async fn get_dashboard_filters(
    State(state): State<Arc<crate::AppState>>,
    Extension(auth): Extension<AuthenticatedAdmin>,
) -> Result<impl IntoResponse> {
    let db = state
        .db
        .database(
            state
                .config
                .mongodb_uri
                .split('/')
                .next_back()
                .unwrap_or("default"),
        );

    let batches_collection: Collection<Batch> = db.collection(Batch::collection_name());
    let locations_collection: Collection<Location> = db.collection(Location::collection_name());

    let mut batches_cursor = batches_collection
        .find(doc! { "createdBy": auth.id })
        .sort(doc! { "name": 1 })
        .await?;
    let mut batches = vec![FilterOption {
        value: "all".to_string(),
        label: "All Batches".to_string(),
    }];
    while batches_cursor.advance().await? {
        let batch = batches_cursor.deserialize_current()?;
        if let Some(id) = batch.id {
            batches.push(FilterOption {
                value: id.to_hex(),
                label: batch.name,
            });
        }
    }

    let mut locations_cursor = locations_collection
        .find(doc! { "createdBy": auth.id })
        .sort(doc! { "name": 1 })
        .await?;
    let mut centers = vec![FilterOption {
        value: "all".to_string(),
        label: "All Centers".to_string(),
    }];
    while locations_cursor.advance().await? {
        let location = locations_cursor.deserialize_current()?;
        if let Some(id) = location.id {
            centers.push(FilterOption {
                value: id.to_hex(),
                label: location.name,
            });
        }
    }

    let today = Utc::now();
    let day_of_week = today.weekday().num_days_from_monday() as i64;
    let start_of_week = today - chrono::Duration::days(day_of_week);
    let end_of_week = start_of_week + chrono::Duration::days(6);

    let months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    let short_months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    let yesterday = today - chrono::Duration::days(1);

    let timeframes = vec![
        format!(
            "This Week ({} {} - {} {})",
            short_months[start_of_week.month() as usize - 1],
            start_of_week.day(),
            short_months[end_of_week.month() as usize - 1],
            end_of_week.day()
        ),
        format!(
            "Today ({} {})",
            short_months[today.month() as usize - 1],
            today.day()
        ),
        format!(
            "Yesterday ({} {})",
            short_months[yesterday.month() as usize - 1],
            yesterday.day()
        ),
        format!("This Month ({})", months[today.month() as usize - 1]),
    ];

    let risk_levels = vec![
        "All Levels".to_string(),
        "High Risk".to_string(),
        "Medium Risk".to_string(),
        "Low Risk".to_string(),
    ];

    Ok(Json(DashboardFilters {
        batches,
        centers,
        timeframes,
        risk_levels,
    }))
}

// Recent Activity
#[derive(Debug, Serialize)]
pub struct RecentActivity {
    pub student_name: String,
    pub roll_number: String,
    pub location_name: String,
    pub captured_at: DateTime<Utc>,
    pub verified: bool,
}

pub async fn get_recent_activity(
    State(state): State<Arc<crate::AppState>>,
    Extension(auth): Extension<AuthenticatedAdmin>,
) -> Result<impl IntoResponse> {
    let db = state
        .db
        .database(
            state
                .config
                .mongodb_uri
                .split('/')
                .next_back()
                .unwrap_or("default"),
        );

    let sessions_collection: Collection<Session> = db.collection(Session::collection_name());
    let locations_collection: Collection<Location> = db.collection(Location::collection_name());
    let attendances_collection: Collection<Attendance> = db.collection(Attendance::collection_name());

    // Get session IDs for this admin
    let mut sessions_cursor = sessions_collection
        .find(doc! { "createdBy": auth.id })
        .projection(doc! { "_id": 1, "locationId": 1 })
        .await?;
    let mut session_map = std::collections::HashMap::new();
    while sessions_cursor.advance().await? {
        let session = sessions_cursor.deserialize_current()?;
        if let Some(id) = session.id {
            session_map.insert(id, session.location_id);
        }
    }

    if session_map.is_empty() {
        return Ok(Json::<Vec<RecentActivity>>(vec![]));
    }

    let session_ids: Vec<_> = session_map.keys().cloned().collect();

    // Pre-fetch all unique location IDs to avoid N+1 queries
    let location_ids: std::collections::HashSet<_> = session_map.values().copied().collect();
    let location_ids_vec: Vec<_> = location_ids.into_iter().collect();

    let mut locations_cursor = locations_collection
        .find(doc! { "_id": { "$in": location_ids_vec } })
        .projection(doc! { "_id": 1, "name": 1 })
        .await?;

    let mut location_names = std::collections::HashMap::new();
    while locations_cursor.advance().await? {
        let loc = locations_cursor.deserialize_current()?;
        if let Some(id) = loc.id {
            location_names.insert(id, loc.name);
        }
    }

    // Get recent attendance for these sessions
    let mut attendance_cursor = attendances_collection
        .find(doc! { "sessionId": { "$in": session_ids } })
        .sort(doc! { "capturedAt": -1 })
        .limit(5)
        .await?;

    let mut activities = Vec::new();
    while attendance_cursor.advance().await? {
        let attendance = attendance_cursor.deserialize_current()?;

        // Get location name from pre-fetched HashMap
        let location_name = session_map
            .get(&attendance.session_id)
            .and_then(|loc_id| location_names.get(loc_id).cloned())
            .unwrap_or_else(|| "Unknown".to_string());

        activities.push(RecentActivity {
            student_name: attendance.student_name,
            roll_number: attendance.roll_number,
            location_name,
            captured_at: attendance.captured_at,
            verified: attendance.verified,
        });
    }

    Ok(Json(activities))
}

// Attendance Series
#[derive(Debug, Deserialize)]
pub struct AttendanceSeriesQuery {
    pub days: Option<i64>,
    pub location_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AttendanceSeriesItem {
    pub date: String,
    pub location: String,
    pub session: String,
    pub count: i64,
}

pub async fn get_attendance_series(
    State(state): State<Arc<crate::AppState>>,
    Extension(auth): Extension<AuthenticatedAdmin>,
    Query(query): Query<AttendanceSeriesQuery>,
) -> Result<impl IntoResponse> {
    let db = state
        .db
        .database(
            state
                .config
                .mongodb_uri
                .split('/')
                .next_back()
                .unwrap_or("default"),
        );

    let days = query.days.unwrap_or(180).min(730);
    let from = Utc::now() - chrono::Duration::days(days);

    let sessions_collection: Collection<Session> = db.collection(Session::collection_name());
    let locations_collection: Collection<Location> = db.collection(Location::collection_name());
    let attendances_collection: Collection<Attendance> = db.collection(Attendance::collection_name());

    // Get admin's locations
    let mut locations_cursor = locations_collection
        .find(doc! { "createdBy": auth.id })
        .projection(doc! { "_id": 1, "name": 1 })
        .await?;
    let mut location_ids = Vec::new();
    let mut location_names = std::collections::HashMap::new();
    while locations_cursor.advance().await? {
        let loc = locations_cursor.deserialize_current()?;
        if let Some(id) = loc.id {
            location_ids.push(id);
            location_names.insert(id, loc.name);
        }
    }

    if location_ids.is_empty() {
        return Ok(Json::<Vec<AttendanceSeriesItem>>(vec![]));
    }

    // Get sessions for these locations
    let mut sessions_cursor = sessions_collection
        .find(doc! { "locationId": { "$in": &location_ids } })
        .await?;
    let mut session_map = std::collections::HashMap::new();
    let mut session_ids = Vec::new();
    while sessions_cursor.advance().await? {
        let session = sessions_cursor.deserialize_current()?;
        if let Some(id) = session.id {
            session_ids.push(id);
            session_map.insert(
                id,
                (session.location_id, session.description.unwrap_or_else(|| "Session".to_string())),
            );
        }
    }

    if session_ids.is_empty() {
        return Ok(Json::<Vec<AttendanceSeriesItem>>(vec![]));
    }

    // Get attendance
    let mut attendance_cursor = attendances_collection
        .find(doc! {
            "sessionId": { "$in": session_ids },
            "capturedAt": { "$gte": BsonDateTime::from_millis(from.timestamp_millis()) }
        })
        .sort(doc! { "capturedAt": 1 })
        .await?;

    let mut result = Vec::new();
    while attendance_cursor.advance().await? {
        let attendance = attendance_cursor.deserialize_current()?;
        if let Some((location_id, description)) = session_map.get(&attendance.session_id) {
            let location = location_names.get(location_id).cloned().unwrap_or_else(|| "Unknown".to_string());
            let date = attendance.captured_at.format("%Y-%m-%d").to_string();
            result.push(AttendanceSeriesItem {
                date,
                location,
                session: description.clone(),
                count: 1,
            });
        }
    }

    Ok(Json(result))
}

// Sessions by Date
#[derive(Debug, Deserialize)]
pub struct SessionsByDateQuery {
    pub date: String,
}

#[derive(Debug, Serialize)]
pub struct SessionByDateItem {
    pub session_id: String,
    pub session: String,
    pub description: String,
    pub location: String,
    pub time: DateTime<Utc>,
    pub count: i64,
    pub date: String,
}

pub async fn get_sessions_by_date(
    State(state): State<Arc<crate::AppState>>,
    Extension(auth): Extension<AuthenticatedAdmin>,
    Query(query): Query<SessionsByDateQuery>,
) -> Result<impl IntoResponse> {
    let db = state
        .db
        .database(
            state
                .config
                .mongodb_uri
                .split('/')
                .next_back()
                .unwrap_or("default"),
        );

    let locations_collection: Collection<Location> = db.collection(Location::collection_name());
    let sessions_collection: Collection<Session> = db.collection(Session::collection_name());
    let attendances_collection: Collection<Attendance> = db.collection(Attendance::collection_name());

    // Get admin's locations
    let mut locations_cursor = locations_collection
        .find(doc! { "createdBy": auth.id })
        .projection(doc! { "_id": 1, "name": 1 })
        .await?;
    let mut location_ids = Vec::new();
    let mut location_names = std::collections::HashMap::new();
    while locations_cursor.advance().await? {
        let loc = locations_cursor.deserialize_current()?;
        if let Some(id) = loc.id {
            location_ids.push(id);
            location_names.insert(id, loc.name);
        }
    }

    if location_ids.is_empty() {
        return Ok(Json::<Vec<SessionByDateItem>>(vec![]));
    }

    // Get sessions for these locations
    let mut sessions_cursor = sessions_collection
        .find(doc! { "locationId": { "$in": &location_ids } })
        .await?;
    let mut session_map = std::collections::HashMap::new();
    let mut session_ids = Vec::new();
    while sessions_cursor.advance().await? {
        let session = sessions_cursor.deserialize_current()?;
        if let Some(id) = session.id {
            session_ids.push(id);
            session_map.insert(
                id,
                (session.location_id, session.description, session.created_at),
            );
        }
    }

    if session_ids.is_empty() {
        return Ok(Json::<Vec<SessionByDateItem>>(vec![]));
    }

    // Get attendance for the date
    let date_start = format!("{}T00:00:00.000Z", query.date);
    let date_end = format!("{}T23:59:59.999Z", query.date);

    let mut attendance_cursor = attendances_collection
        .find(doc! {
            "sessionId": { "$in": session_ids.clone() },
            "capturedAt": { "$gte": date_start, "$lt": date_end }
        })
        .await?;

    let mut count_map = std::collections::HashMap::new();
    while attendance_cursor.advance().await? {
        let attendance = attendance_cursor.deserialize_current()?;
        let count = count_map.entry(attendance.session_id).or_insert(0i64);
        *count += 1;
    }

    let mut result = Vec::new();
    for session_id in session_ids {
        if let Some((location_id, description, created_at)) = session_map.get(&session_id) {
            let count = *count_map.get(&session_id).unwrap_or(&0);
            if count > 0 {
                let location = location_names.get(location_id).cloned().unwrap_or_else(|| "Unknown".to_string());
                result.push(SessionByDateItem {
                    session_id: session_id.to_hex(),
                    session: description.clone().unwrap_or_else(|| "Session".to_string()),
                    description: description.clone().unwrap_or_else(|| "Session".to_string()),
                    location,
                    time: *created_at,
                    count,
                    date: query.date.clone(),
                });
            }
        }
    }

    Ok(Json(result))
}

// =================== Session Attendance Endpoints ===================

#[derive(Debug, Serialize)]
pub struct SessionAttendanceResponse {
    #[serde(flatten)]
    pub attendance: Attendance,
    pub signed_photo_url: Option<String>,
}

pub async fn get_session_attendance(
    State(state): State<Arc<crate::AppState>>,
    Extension(auth): Extension<AuthenticatedAdmin>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<impl IntoResponse> {
    let db = state
        .db
        .database(
            state
                .config
                .mongodb_uri
                .split('/')
                .next_back()
                .unwrap_or("default"),
        );

    let sessions_collection: Collection<Session> = db.collection(Session::collection_name());
    let attendances_collection: Collection<Attendance> = db.collection(Attendance::collection_name());

    use mongodb::bson::oid::ObjectId;
    let session_id = ObjectId::parse_str(&id)
        .map_err(|e| AppError::BadRequest(format!("Invalid session ID: {}", e)))?;

    // Verify session ownership
    sessions_collection
        .find_one(doc! { "_id": session_id, "createdBy": auth.id })
        .await?
        .ok_or_else(|| AppError::NotFound("Session not found".to_string()))?;

    let mut cursor = attendances_collection
        .find(doc! { "sessionId": session_id })
        .sort(doc! { "capturedAt": -1 })
        .await?;

    let mut result = Vec::new();
    while cursor.advance().await? {
        let attendance = cursor.deserialize_current()?;
        result.push(SessionAttendanceResponse {
            attendance,
            signed_photo_url: None,
        });
    }

    Ok(Json(result))
}

#[derive(Debug, Serialize)]
pub struct SessionStatsResponse {
    pub total_attendance: i64,
    pub verified_attendance: i64,
    pub unverified_attendance: i64,
    pub session: SessionStatus,
}

#[derive(Debug, Serialize)]
pub struct SessionStatus {
    pub is_active: bool,
    pub expires_at: DateTime<Utc>,
    pub rotation_count: i32,
}

pub async fn get_session_stats(
    State(state): State<Arc<crate::AppState>>,
    Extension(auth): Extension<AuthenticatedAdmin>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<impl IntoResponse> {
    let db = state
        .db
        .database(
            state
                .config
                .mongodb_uri
                .split('/')
                .next_back()
                .unwrap_or("default"),
        );

    let sessions_collection: Collection<Session> = db.collection(Session::collection_name());
    let attendances_collection: Collection<Attendance> = db.collection(Attendance::collection_name());

    use mongodb::bson::oid::ObjectId;
    let session_id = ObjectId::parse_str(&id)
        .map_err(|e| AppError::BadRequest(format!("Invalid session ID: {}", e)))?;

    let session = sessions_collection
        .find_one(doc! { "_id": session_id, "createdBy": auth.id })
        .await?
        .ok_or_else(|| AppError::NotFound("Session not found".to_string()))?;

    let total_attendance = attendances_collection
        .count_documents(doc! { "sessionId": session_id })
        .await? as i64;
    let verified_attendance = attendances_collection
        .count_documents(doc! { "sessionId": session_id, "verified": true })
        .await? as i64;

    Ok(Json(SessionStatsResponse {
        total_attendance,
        verified_attendance,
        unverified_attendance: total_attendance - verified_attendance,
        session: SessionStatus {
            is_active: session.is_active,
            expires_at: session.expires_at,
            rotation_count: session.rotation_count,
        },
    }))
}

#[derive(Debug, Serialize)]
pub struct TOTPResponse {
    pub session_id: String,
    pub totp_code: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
    pub window_seconds: Option<i64>,
    pub session_active: bool,
}

pub async fn get_session_totp(
    State(state): State<Arc<crate::AppState>>,
    Extension(auth): Extension<AuthenticatedAdmin>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<impl IntoResponse> {
    let db = state
        .db
        .database(
            state
                .config
                .mongodb_uri
                .split('/')
                .next_back()
                .unwrap_or("default"),
        );

    use mongodb::bson::oid::ObjectId;
    let sessions_collection: Collection<Session> = db.collection(Session::collection_name());

    let session_id = ObjectId::parse_str(&id)
        .map_err(|e| AppError::BadRequest(format!("Invalid session ID: {}", e)))?;

    let session = sessions_collection
        .find_one(doc! { "_id": session_id, "createdBy": auth.id })
        .await?
        .ok_or_else(|| AppError::NotFound("Session not found".to_string()))?;

    Ok(Json(TOTPResponse {
        session_id: id,
        totp_code: session.totp_secret,
        expires_at: Some(session.expires_at),
        window_seconds: Some(30),
        session_active: session.is_active,
    }))
}

pub async fn get_session_devices(
    State(state): State<Arc<crate::AppState>>,
    Extension(auth): Extension<AuthenticatedAdmin>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<impl IntoResponse> {
    let db = state
        .db
        .database(
            state
                .config
                .mongodb_uri
                .split('/')
                .next_back()
                .unwrap_or("default"),
        );

    use mongodb::bson::oid::ObjectId;
    let sessions_collection: Collection<Session> = db.collection(Session::collection_name());
    let devices_collection: Collection<crate::models::Device> = db.collection(crate::models::Device::collection_name());

    let session_id = ObjectId::parse_str(&id)
        .map_err(|e| AppError::BadRequest(format!("Invalid session ID: {}", e)))?;

    sessions_collection
        .find_one(doc! { "_id": session_id, "createdBy": auth.id })
        .await?
        .ok_or_else(|| AppError::NotFound("Session not found".to_string()))?;

    let mut cursor = devices_collection
        .find(doc! { "sessionId": session_id })
        .sort(doc! { "lastSeenAt": -1 })
        .await?;

    let mut result = Vec::new();
    while cursor.advance().await? {
        let device = cursor.deserialize_current()?;
        result.push(device);
    }

    Ok(Json(result))
}

#[derive(Debug, Serialize)]
pub struct AbsentStudent {
    pub name: String,
    pub roll_number: String,
    pub college_name: Option<String>,
    pub email: Option<String>,
}

pub async fn get_session_absent(
    State(state): State<Arc<crate::AppState>>,
    Extension(auth): Extension<AuthenticatedAdmin>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<impl IntoResponse> {
    let db = state
        .db
        .database(
            state
                .config
                .mongodb_uri
                .split('/')
                .next_back()
                .unwrap_or("default"),
        );

    use mongodb::bson::oid::ObjectId;
    let sessions_collection: Collection<Session> = db.collection(Session::collection_name());
    let batches_collection: Collection<Batch> = db.collection(Batch::collection_name());
    let attendances_collection: Collection<Attendance> = db.collection(Attendance::collection_name());

    let session_id = ObjectId::parse_str(&id)
        .map_err(|e| AppError::BadRequest(format!("Invalid session ID: {}", e)))?;

    let session = sessions_collection
        .find_one(doc! { "_id": session_id, "createdBy": auth.id })
        .await?
        .ok_or_else(|| AppError::NotFound("Session not found".to_string()))?;

    let batch_id = match session.batch_id {
        Some(id) => id,
        None => return Ok(Json::<Vec<AbsentStudent>>(vec![])),
    };

    let batch = batches_collection
        .find_one(doc! { "_id": batch_id })
        .await?
        .ok_or_else(|| AppError::NotFound("Batch not found".to_string()))?;

    // Get present roll numbers
    let mut cursor = attendances_collection
        .find(doc! { "sessionId": session_id, "verified": true })
        .projection(doc! { "rollNumber": 1 })
        .await?;

    let mut present_rolls = std::collections::HashSet::new();
    while cursor.advance().await? {
        let attendance = cursor.deserialize_current()?;
        present_rolls.insert(attendance.roll_number.to_uppercase());
    }

    let absent_students: Vec<AbsentStudent> = batch
        .students
        .into_iter()
        .filter(|s| !present_rolls.contains(&s.roll_number.to_uppercase()))
        .map(|s| AbsentStudent {
            name: s.name,
            roll_number: s.roll_number,
            college_name: s.college_name,
            email: s.email,
        })
        .collect();

    Ok(Json(absent_students))
}

// =================== Flagged Attendance ===================

pub async fn get_flagged_attendance(
    State(state): State<Arc<crate::AppState>>,
    Extension(auth): Extension<AuthenticatedAdmin>,
    Query(query): Query<FlaggedQuery>,
) -> Result<impl IntoResponse> {
    let db = state
        .db
        .database(
            state
                .config
                .mongodb_uri
                .split('/')
                .next_back()
                .unwrap_or("default"),
        );

    use mongodb::bson::oid::ObjectId;
    let sessions_collection: Collection<Session> = db.collection(Session::collection_name());
    let attendances_collection: Collection<Attendance> = db.collection(Attendance::collection_name());

    let mut filter = doc! { "deviceFlag": { "$ne": null } };

    if let Some(session_id_str) = query.session_id {
        let session_id = ObjectId::parse_str(&session_id_str)
            .map_err(|e| AppError::BadRequest(format!("Invalid session ID: {}", e)))?;
        
        // Verify session ownership
        sessions_collection
            .find_one(doc! { "_id": session_id, "createdBy": auth.id })
            .await?
            .ok_or_else(|| AppError::NotFound("Session not found".to_string()))?;
        
        filter.insert("sessionId", session_id);
    }

    let mut cursor = attendances_collection
        .find(filter)
        .sort(doc! { "capturedAt": -1 })
        .limit(100)
        .await?;

    let mut result = Vec::new();
    while cursor.advance().await? {
        let attendance = cursor.deserialize_current()?;
        result.push(attendance);
    }

    Ok(Json(result))
}

#[derive(Debug, Deserialize)]
pub struct FlaggedQuery {
    pub session_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AttendanceReviewRequest {
    pub reviewed: bool,
    pub review_notes: Option<String>,
}

pub async fn review_attendance(
    State(state): State<Arc<crate::AppState>>,
    Extension(auth): Extension<AuthenticatedAdmin>,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(payload): Json<AttendanceReviewRequest>,
) -> Result<impl IntoResponse> {
    let db = state
        .db
        .database(
            state
                .config
                .mongodb_uri
                .split('/')
                .next_back()
                .unwrap_or("default"),
        );

    use mongodb::bson::oid::ObjectId;
    let attendances_collection: Collection<Attendance> = db.collection(Attendance::collection_name());

    let attendance_id = ObjectId::parse_str(&id)
        .map_err(|e| AppError::BadRequest(format!("Invalid attendance ID: {}", e)))?;

    attendances_collection
        .update_one(
            doc! { "_id": attendance_id },
            doc! {
                "$set": {
                    "flagReviewed": payload.reviewed,
                    "flagReviewedBy": auth.id,
                    "flagReviewedAt": BsonDateTime::now()
                }
            },
        )
        .await?;

    Ok(Json(serde_json::json!({ "success": true })))
}

#[derive(Debug, Deserialize)]
pub struct VerifyRequest {
    pub verified: bool,
}

pub async fn verify_attendance(
    State(state): State<Arc<crate::AppState>>,
    Extension(auth): Extension<AuthenticatedAdmin>,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(payload): Json<VerifyRequest>,
) -> Result<impl IntoResponse> {
    let db = state
        .db
        .database(
            state
                .config
                .mongodb_uri
                .split('/')
                .next_back()
                .unwrap_or("default"),
        );

    use mongodb::bson::oid::ObjectId;
    let attendances_collection: Collection<Attendance> = db.collection(Attendance::collection_name());
    let sessions_collection: Collection<Session> = db.collection(Session::collection_name());

    let attendance_id = ObjectId::parse_str(&id)
        .map_err(|e| AppError::BadRequest(format!("Invalid attendance ID: {}", e)))?;

    // Get attendance and verify ownership
    let attendance = attendances_collection
        .find_one(doc! { "_id": attendance_id })
        .await?
        .ok_or_else(|| AppError::NotFound("Attendance not found".to_string()))?;

    // Verify session ownership
    sessions_collection
        .find_one(doc! { "_id": attendance.session_id, "createdBy": auth.id })
        .await?
        .ok_or_else(|| AppError::NotFound("Session not found".to_string()))?;

    attendances_collection
        .update_one(
            doc! { "_id": attendance_id },
            doc! { "$set": { "verified": payload.verified } },
        )
        .await?;

    Ok(Json(serde_json::json!({
        "message": if payload.verified { "Marked verified" } else { "Marked unverified" },
        "verified": payload.verified
    })))
}

#[derive(Debug, Deserialize)]
pub struct BulkVerifyRequest {
    pub ids: Vec<String>,
    pub verified: bool,
}

pub async fn bulk_verify_attendance(
    State(state): State<Arc<crate::AppState>>,
    Extension(auth): Extension<AuthenticatedAdmin>,
    axum::extract::Path(session_id): axum::extract::Path<String>,
    Json(payload): Json<BulkVerifyRequest>,
) -> Result<impl IntoResponse> {
    let db = state
        .db
        .database(
            state
                .config
                .mongodb_uri
                .split('/')
                .next_back()
                .unwrap_or("default"),
        );

    use mongodb::bson::oid::ObjectId;
    let sessions_collection: Collection<Session> = db.collection(Session::collection_name());
    let attendances_collection: Collection<Attendance> = db.collection(Attendance::collection_name());

    if payload.ids.is_empty() {
        return Err(AppError::BadRequest("ids must be a non-empty array".to_string()));
    }
    if payload.ids.len() > 100 {
        return Err(AppError::BadRequest("Cannot bulk-update more than 100 records at once".to_string()));
    }

    let session_oid = ObjectId::parse_str(&session_id)
        .map_err(|e| AppError::BadRequest(format!("Invalid session ID: {}", e)))?;

    // Verify session ownership
    sessions_collection
        .find_one(doc! { "_id": session_oid, "createdBy": auth.id })
        .await?
        .ok_or_else(|| AppError::NotFound("Session not found".to_string()))?;

    let ids: Result<Vec<ObjectId>> = payload.ids.iter().map(|id| {
        ObjectId::parse_str(id)
            .map_err(|e| AppError::BadRequest(format!("Invalid attendance ID: {}", e)))
    }).collect();
    let ids = ids?;

    let result = attendances_collection
        .update_many(
            doc! { "_id": { "$in": ids }, "sessionId": session_oid },
            doc! { "$set": { "verified": payload.verified } },
        )
        .await?;

    Ok(Json(serde_json::json!({ "updated": result.modified_count })))
}
