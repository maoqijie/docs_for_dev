use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: i64,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionWithMessages {
    pub session: Session,
    pub messages: Vec<Message>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionStateRecord {
    pub session_id: String,
    pub state: String,
    pub updated_at: DateTime<Utc>,
}

impl Session {
    pub fn new(title: String) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            title,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }
}

impl Message {
    pub fn new(session_id: String, role: String, content: String) -> Self {
        Self {
            id: 0,
            session_id,
            role,
            content,
            timestamp: Utc::now(),
        }
    }
}
