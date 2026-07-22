use dashmap::DashMap;
use std::sync::Arc;

pub struct MockDatabase {
    admins: Arc<DashMap<String, serde_json::Value>>,
    sessions: Arc<DashMap<String, serde_json::Value>>,
    attendances: Arc<DashMap<String, serde_json::Value>>,
    locations: Arc<DashMap<String, serde_json::Value>>,
}

impl MockDatabase {
    pub fn new() -> Self {
        Self {
            admins: Arc::new(DashMap::new()),
            sessions: Arc::new(DashMap::new()),
            attendances: Arc::new(DashMap::new()),
            locations: Arc::new(DashMap::new()),
        }
    }

    pub fn insert_admin(&self, id: &str, admin: serde_json::Value) {
        self.admins.insert(id.to_string(), admin);
    }

    pub fn get_admin(&self, id: &str) -> Option<serde_json::Value> {
        self.admins.get(id).map(|v| v.clone())
    }

    pub fn insert_session(&self, id: &str, session: serde_json::Value) {
        self.sessions.insert(id.to_string(), session);
    }

    pub fn get_session(&self, id: &str) -> Option<serde_json::Value> {
        self.sessions.get(id).map(|v| v.clone())
    }

    pub fn clear(&self) {
        self.admins.clear();
        self.sessions.clear();
        self.attendances.clear();
        self.locations.clear();
    }
}

impl Default for MockDatabase {
    fn default() -> Self {
        Self::new()
    }
}
