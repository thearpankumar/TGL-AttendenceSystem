use rstest::fixture;

#[fixture]
pub fn test_user_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

#[fixture]
pub fn test_session_id() -> String {
    uuid::Uuid::new_v4().to_string()
}
