use axum::{
    extract::{Json, Multipart, Path, State},
    http::StatusCode,
    response::IntoResponse,
    Extension,
};
use calamine::{open_workbook_from_rs, Ods, Reader, Xls, Xlsx};
use chrono::{DateTime, Utc};
use mongodb::{
    bson::{doc, oid::ObjectId},
    Collection,
};
use serde::Serialize;
use std::io::Cursor;
use std::sync::Arc;

use crate::{
    error::{AppError, Result},
    middleware::AuthenticatedAdmin,
    models::{Batch, BatchCreate, Student},
};

#[derive(Debug, Serialize)]
pub struct BatchResponse {
    #[serde(rename = "_id")]
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    #[serde(rename = "studentCount")]
    pub student_count: usize,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct BatchCreateResponse {
    pub message: String,
    pub batch: BatchResponse,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchDetailResponse {
    #[serde(rename = "_id")]
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub students: Vec<Student>,
    #[serde(rename = "studentCount")]
    pub student_count: usize,
    pub created_by: String,
    pub created_at: DateTime<Utc>,
}

pub async fn create_batch(
    State(state): State<Arc<crate::AppState>>,
    Extension(auth): Extension<AuthenticatedAdmin>,
    Json(payload): Json<BatchCreate>,
) -> Result<impl IntoResponse> {
    let collection: Collection<Batch> = state
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
        .collection(Batch::collection_name());

    let batch = Batch {
        id: None,
        name: payload.name,
        description: payload.description,
        students: payload.students,
        created_by: auth.id,
        created_at: Utc::now(),
    };

    let result = collection.insert_one(&batch).await?;
    let batch_id = result
        .inserted_id
        .as_object_id()
        .ok_or_else(|| AppError::Internal("Failed to get inserted ID".to_string()))?;

    let batch_created_at = batch.created_at;

    Ok((
        StatusCode::CREATED,
        Json(BatchCreateResponse {
            message: "Batch created successfully".to_string(),
            batch: BatchResponse {
                id: batch_id.to_hex(),
                name: batch.name,
                description: batch.description,
                student_count: batch.students.len(),
                created_at: batch_created_at.to_rfc3339(),
            },
        }),
    ))
}

pub async fn get_batches(
    State(state): State<Arc<crate::AppState>>,
    Extension(_auth): Extension<AuthenticatedAdmin>,
) -> Result<impl IntoResponse> {
    let collection: Collection<Batch> = state
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
        .collection(Batch::collection_name());

    let mut cursor = collection
        .find(doc! {})
        .sort(doc! { "createdAt": -1 })
        .await?;
    let mut batches = Vec::new();

    while cursor.advance().await? {
        let batch = cursor.deserialize_current()?;
        batches.push(BatchResponse {
            id: batch
                .id
                .ok_or_else(|| AppError::Internal("No ID".to_string()))?
                .to_hex(),
            name: batch.name,
            description: batch.description,
            student_count: batch.students.len(),
            created_at: batch.created_at.to_rfc3339(),
        });
    }

    Ok(Json(batches))
}

pub async fn get_batch(
    State(state): State<Arc<crate::AppState>>,
    Extension(_auth): Extension<AuthenticatedAdmin>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let collection: Collection<Batch> = state
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
        .collection(Batch::collection_name());

    let batch_id = ObjectId::parse_str(&id)
        .map_err(|e| AppError::BadRequest(format!("Invalid batch ID: {}", e)))?;

    let batch = collection
        .find_one(doc! { "_id": batch_id })
        .await?
        .ok_or_else(|| AppError::NotFound("Batch not found".to_string()))?;

    Ok(Json(BatchDetailResponse {
        id: batch.id.unwrap().to_hex(),
        name: batch.name,
        description: batch.description,
        students: batch.students.clone(),
        student_count: batch.students.len(),
        created_by: batch.created_by.to_hex(),
        created_at: batch.created_at,
    }))
}

pub async fn delete_batch(
    State(state): State<Arc<crate::AppState>>,
    Extension(_auth): Extension<AuthenticatedAdmin>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let collection: Collection<Batch> = state
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
        .collection(Batch::collection_name());

    let batch_id = ObjectId::parse_str(&id)
        .map_err(|e| AppError::BadRequest(format!("Invalid batch ID: {}", e)))?;

    collection.delete_one(doc! { "_id": batch_id }).await?;

    Ok(Json(serde_json::json!({
        "message": "Batch deleted successfully"
    })))
}

#[derive(Debug, Serialize)]
pub struct UploadBatchResponse {
    #[serde(rename = "batchId")]
    pub batch_id: String,
    pub name: String,
    #[serde(rename = "studentsImported")]
    pub students_imported: usize,
    #[serde(rename = "studentsSkipped")]
    pub students_skipped: usize,
    pub errors: Vec<String>,
}

pub async fn upload_batch_excel(
    State(state): State<Arc<crate::AppState>>,
    Extension(auth): Extension<AuthenticatedAdmin>,
    mut multipart: Multipart,
) -> Result<impl IntoResponse> {
    let mut file_data: Option<Vec<u8>> = None;
    let mut batch_name: Option<String> = None;
    let mut description: Option<String> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Multipart error: {}", e)))?
    {
        let name = field.name().unwrap_or("").to_string();

        match name.as_str() {
            "file" => {
                file_data = Some(
                    field
                        .bytes()
                        .await
                        .map_err(|e| AppError::BadRequest(format!("Failed to read file: {}", e)))?
                        .to_vec(),
                );
            }
            "name" => {
                batch_name =
                    Some(field.text().await.map_err(|e| {
                        AppError::BadRequest(format!("Failed to read name: {}", e))
                    })?);
            }
            "description" => {
                description = Some(field.text().await.map_err(|e| {
                    AppError::BadRequest(format!("Failed to read description: {}", e))
                })?);
            }
            _ => {}
        }
    }

    let file_data =
        file_data.ok_or_else(|| AppError::BadRequest("No file uploaded".to_string()))?;

    let batch_name =
        batch_name.unwrap_or_else(|| format!("Batch_{}", Utc::now().format("%Y%m%d_%H%M%S")));

    let (students, errors) = parse_excel(&file_data)?;

    let collection: Collection<Batch> = state
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
        .collection(Batch::collection_name());

    let batch = Batch {
        id: None,
        name: batch_name.clone(),
        description,
        students: students.clone(),
        created_by: auth.id,
        created_at: Utc::now(),
    };

    let result = collection.insert_one(&batch).await?;
    let batch_id = result
        .inserted_id
        .as_object_id()
        .ok_or_else(|| AppError::Internal("Failed to get inserted ID".to_string()))?;

    Ok((
        StatusCode::CREATED,
        Json(UploadBatchResponse {
            batch_id: batch_id.to_hex(),
            name: batch_name,
            students_imported: students.len(),
            students_skipped: 0,
            errors,
        }),
    ))
}

fn format_cell(cell: &calamine::Data) -> Option<String> {
    match cell {
        calamine::Data::String(s) => {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        }
        calamine::Data::Int(n) => Some(n.to_string()),
        calamine::Data::Float(f) => {
            if f.fract() == 0.0 {
                Some((*f as i64).to_string())
            } else {
                Some(f.to_string())
            }
        }
        calamine::Data::DateTime(d) => Some(d.to_string()),
        calamine::Data::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}

fn normalize_header(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect()
}

fn parse_excel(data: &[u8]) -> Result<(Vec<Student>, Vec<String>)> {
    let cursor = Cursor::new(data);
    let mut raw_rows: Vec<Vec<String>> = Vec::new();

    if let Ok(mut wb) = open_workbook_from_rs::<Xlsx<_>, _>(cursor.clone()) {
        if let Some(Ok(range)) = wb.worksheet_range_at(0) {
            for row in range.rows() {
                let cells: Vec<String> = row.iter().filter_map(format_cell).collect();
                if !cells.is_empty() {
                    raw_rows.push(cells);
                }
            }
        }
    } else if let Ok(mut wb) = open_workbook_from_rs::<Xls<_>, _>(cursor.clone()) {
        if let Some(Ok(range)) = wb.worksheet_range_at(0) {
            for row in range.rows() {
                let cells: Vec<String> = row.iter().filter_map(format_cell).collect();
                if !cells.is_empty() {
                    raw_rows.push(cells);
                }
            }
        }
    } else if let Ok(mut wb) = open_workbook_from_rs::<Ods<_>, _>(cursor.clone()) {
        if let Some(Ok(range)) = wb.worksheet_range_at(0) {
            for row in range.rows() {
                let cells: Vec<String> = row.iter().filter_map(format_cell).collect();
                if !cells.is_empty() {
                    raw_rows.push(cells);
                }
            }
        }
    } else if let Ok(text) = std::str::from_utf8(data) {
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let cells: Vec<String> = line
                .split(',')
                .map(|s| s.trim_matches('"').trim().to_string())
                .collect();
            if !cells.is_empty() {
                raw_rows.push(cells);
            }
        }
    } else {
        return Err(AppError::BadRequest(
            "Failed to open file. Unsupported or corrupted spreadsheet/CSV format.".to_string(),
        ));
    }

    let mut students = Vec::new();
    let mut errors = Vec::new();

    if raw_rows.is_empty() {
        return Ok((students, errors));
    }

    let roll_aliases = [
        "roll",
        "rollno",
        "rollnumber",
        "rollnum",
        "register",
        "registerno",
        "registernumber",
        "regno",
        "regnumber",
        "regnno",
        "regnum",
        "registration",
        "registrationno",
        "registrationnumber",
        "registrationnum",
        "id",
        "studentid",
        "studentno",
        "stdid",
        "enrollment",
        "enrollmentno",
        "enrollmentnumber",
        "enrolment",
        "enrolmentno",
        "enrolmentnumber",
        "usn",
        "hallticket",
        "hallticketno",
        "htno",
        "slno",
        "sno",
        "srno",
        "serialno",
    ];

    let name_aliases = [
        "name",
        "studentname",
        "fullname",
        "student",
        "nameofthestudent",
        "candidate",
        "candidatename",
        "stname",
    ];

    let email_aliases = ["email", "emailid", "emailaddress", "mail", "mailid"];

    let college_aliases = [
        "college",
        "collegename",
        "institution",
        "institute",
        "dept",
        "department",
        "branch",
    ];

    let mut name_col: Option<usize> = None;
    let mut roll_col: Option<usize> = None;
    let mut email_col: Option<usize> = None;
    let mut college_col: Option<usize> = None;

    // 1. Header row matching
    let header_row = &raw_rows[0];
    for (i, cell_str) in header_row.iter().enumerate() {
        let norm = normalize_header(cell_str);
        if name_col.is_none() && name_aliases.contains(&norm.as_str()) {
            name_col = Some(i);
        } else if roll_col.is_none() && roll_aliases.contains(&norm.as_str()) {
            roll_col = Some(i);
        } else if email_col.is_none() && email_aliases.contains(&norm.as_str()) {
            email_col = Some(i);
        } else if college_col.is_none() && college_aliases.contains(&norm.as_str()) {
            college_col = Some(i);
        }
    }

    let start_row_idx = if name_col.is_some() || roll_col.is_some() {
        1
    } else {
        0
    };

    // 2. Fallback heuristic if headers were not explicitly matched:
    if name_col.is_none() || roll_col.is_none() {
        if let Some(sample_row) = raw_rows.get(start_row_idx) {
            if sample_row.len() >= 2 {
                let col0_val = &sample_row[0];
                let col1_val = &sample_row[1];

                let col0_has_digit = col0_val.chars().any(|c| c.is_ascii_digit());
                let col1_has_digit = col1_val.chars().any(|c| c.is_ascii_digit());

                if name_col.is_none() && roll_col.is_none() {
                    if col0_has_digit && !col1_has_digit {
                        roll_col = Some(0);
                        name_col = Some(1);
                    } else if !col0_has_digit && col1_has_digit {
                        name_col = Some(0);
                        roll_col = Some(1);
                    } else {
                        roll_col = Some(0);
                        name_col = Some(1);
                    }
                } else if roll_col.is_none() {
                    let taken = name_col.unwrap();
                    roll_col = (0..sample_row.len()).find(|&i| i != taken);
                } else if name_col.is_none() {
                    let taken = roll_col.unwrap();
                    name_col = (0..sample_row.len()).find(|&i| i != taken);
                }
            }
        }
    }

    for (row_offset, row) in raw_rows.iter().skip(start_row_idx).enumerate() {
        let get_val = |col: Option<usize>| -> Option<String> {
            col.and_then(|i| row.get(i).map(|s| s.trim().to_string()))
                .filter(|s| !s.is_empty())
        };

        let name = get_val(name_col);
        let roll_number = get_val(roll_col);
        let email = get_val(email_col);
        let college_name = get_val(college_col);

        match (&name, &roll_number) {
            (Some(n), Some(r)) if !n.trim().is_empty() && !r.trim().is_empty() => {
                students.push(Student {
                    name: n.trim().to_string(),
                    roll_number: r.trim().to_string(),
                    email: email.map(|e| e.trim().to_string()),
                    college_name: college_name.map(|c| c.trim().to_string()),
                });
            }
            _ => {
                if name.is_some() || roll_number.is_some() {
                    errors.push(format!(
                        "Row {}: Missing required fields (name/roll_number)",
                        row_offset + start_row_idx + 1
                    ));
                }
            }
        }
    }

    Ok((students, errors))
}

#[cfg(test)]
mod batch_tests {
    use super::*;

    #[test]
    fn test_normalize_header() {
        assert_eq!(normalize_header("Register No."), "registerno");
        assert_eq!(
            normalize_header("Registration Number"),
            "registrationnumber"
        );
        assert_eq!(normalize_header("Roll No."), "rollno");
        assert_eq!(normalize_header("Reg. No"), "regno");
        assert_eq!(normalize_header("Student ID"), "studentid");
        assert_eq!(normalize_header("Full Name"), "fullname");
    }

    #[test]
    fn test_parse_csv_register_number_first() {
        let csv_data = b"Register Number,Student Name,Email\n21B91A0501,Alice Smith,alice@example.com\n21B91A0502,Bob Jones,bob@example.com\n";
        let (students, errors) = parse_excel(csv_data).unwrap();
        assert!(errors.is_empty());
        assert_eq!(students.len(), 2);
        assert_eq!(students[0].roll_number, "21B91A0501");
        assert_eq!(students[0].name, "Alice Smith");
        assert_eq!(students[0].email.as_deref(), Some("alice@example.com"));
        assert_eq!(students[1].roll_number, "21B91A0502");
        assert_eq!(students[1].name, "Bob Jones");
    }

    #[test]
    fn test_parse_csv_name_first_registration_second() {
        let csv_data =
            b"Full Name,Registration No.,Department\nCharlie Brown,REG2024001,Computer Science\n";
        let (students, errors) = parse_excel(csv_data).unwrap();
        assert!(errors.is_empty());
        assert_eq!(students.len(), 1);
        assert_eq!(students[0].name, "Charlie Brown");
        assert_eq!(students[0].roll_number, "REG2024001");
        assert_eq!(
            students[0].college_name.as_deref(),
            Some("Computer Science")
        );
    }

    #[test]
    fn test_parse_csv_fallback_without_headers() {
        let csv_data = b"21B91A0505,David Miller\n21B91A0506,Eve Wilson\n";
        let (students, errors) = parse_excel(csv_data).unwrap();
        assert!(errors.is_empty());
        assert_eq!(students.len(), 2);
        assert_eq!(students[0].roll_number, "21B91A0505");
        assert_eq!(students[0].name, "David Miller");
    }
}
