use std::sync::{Arc, Mutex};

use chrono::Utc;
use rusqlite::{params, Connection, Result};

use crate::db::models::*;

/// SQLite 数据库管理器，使用 Arc<Mutex<Connection>> 保证线程安全
pub struct DbManager {
    conn: Arc<Mutex<Connection>>,
}

impl DbManager {
    pub fn new(db_path: &str) -> Result<Self> {
        let conn = Connection::open(db_path)?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
                content TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)",
            [],
        )?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn create_session(&self, title: &str) -> Result<Session> {
        let session = Session::new(title.to_string());
        let conn = self.conn.lock().unwrap();

        conn.execute(
            "INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
            params![
                &session.id,
                &session.title,
                session.created_at.to_rfc3339(),
                session.updated_at.to_rfc3339(),
            ],
        )?;

        Ok(session)
    }

    pub fn get_all_sessions(&self) -> Result<Vec<Session>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, title, created_at, updated_at FROM sessions ORDER BY updated_at DESC",
        )?;

        let sessions = stmt
            .query_map([], |row| {
                Ok(Session {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    created_at: row
                        .get::<_, String>(2)?
                        .parse::<chrono::DateTime<chrono::FixedOffset>>()
                        .unwrap()
                        .with_timezone(&Utc),
                    updated_at: row
                        .get::<_, String>(3)?
                        .parse::<chrono::DateTime<chrono::FixedOffset>>()
                        .unwrap()
                        .with_timezone(&Utc),
                })
            })?
            .collect::<Result<Vec<_>>>()?;

        Ok(sessions)
    }

    pub fn get_session(&self, session_id: &str) -> Result<Option<Session>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt =
            conn.prepare("SELECT id, title, created_at, updated_at FROM sessions WHERE id = ?1")?;

        let mut rows = stmt.query(params![session_id])?;

        if let Some(row) = rows.next()? {
            Ok(Some(Session {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: row
                    .get::<_, String>(2)?
                    .parse::<chrono::DateTime<chrono::FixedOffset>>()
                    .unwrap()
                    .with_timezone(&Utc),
                updated_at: row
                    .get::<_, String>(3)?
                    .parse::<chrono::DateTime<chrono::FixedOffset>>()
                    .unwrap()
                    .with_timezone(&Utc),
            }))
        } else {
            Ok(None)
        }
    }

    pub fn update_session_title(&self, session_id: &str, title: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE sessions SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![title, Utc::now().to_rfc3339(), session_id],
        )?;
        Ok(())
    }

    pub fn delete_session(&self, session_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM sessions WHERE id = ?1", params![session_id])?;
        Ok(())
    }

    pub fn add_message(&self, session_id: &str, role: &str, content: &str) -> Result<Message> {
        let timestamp = Utc::now();
        let conn = self.conn.lock().unwrap();

        conn.execute(
            "INSERT INTO messages (session_id, role, content, timestamp) VALUES (?1, ?2, ?3, ?4)",
            params![session_id, role, content, timestamp.to_rfc3339()],
        )?;

        let id = conn.last_insert_rowid();

        conn.execute(
            "UPDATE sessions SET updated_at = ?1 WHERE id = ?2",
            params![timestamp.to_rfc3339(), session_id],
        )?;

        Ok(Message {
            id,
            session_id: session_id.to_string(),
            role: role.to_string(),
            content: content.to_string(),
            timestamp,
        })
    }

    pub fn get_session_messages(&self, session_id: &str) -> Result<Vec<Message>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, session_id, role, content, timestamp FROM messages
             WHERE session_id = ?1 ORDER BY timestamp ASC",
        )?;

        let messages = stmt
            .query_map(params![session_id], |row| {
                Ok(Message {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    role: row.get(2)?,
                    content: row.get(3)?,
                    timestamp: row
                        .get::<_, String>(4)?
                        .parse::<chrono::DateTime<chrono::FixedOffset>>()
                        .unwrap()
                        .with_timezone(&Utc),
                })
            })?
            .collect::<Result<Vec<_>>>()?;

        Ok(messages)
    }

    pub fn get_recent_messages(&self, session_id: &str, limit: usize) -> Result<Vec<Message>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, session_id, role, content, timestamp FROM messages
             WHERE session_id = ?1 ORDER BY timestamp DESC LIMIT ?2",
        )?;

        let messages = stmt
            .query_map(params![session_id, limit], |row| {
                Ok(Message {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    role: row.get(2)?,
                    content: row.get(3)?,
                    timestamp: row
                        .get::<_, String>(4)?
                        .parse::<chrono::DateTime<chrono::FixedOffset>>()
                        .unwrap()
                        .with_timezone(&Utc),
                })
            })?
            .collect::<Result<Vec<_>>>()?;

        Ok(messages.into_iter().rev().collect())
    }
}
