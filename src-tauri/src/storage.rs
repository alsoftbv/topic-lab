use crate::types::{AppData, Connection, LegacyProject};
use fs2::FileExt;
use std::collections::HashMap;
use std::fs;
use std::fs::{File, OpenOptions};
use std::path::PathBuf;
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum StorageError {
    #[error("Failed to get app data directory")]
    NoAppDataDir,
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

pub struct Storage {
    data_path: PathBuf,
    legacy_path: PathBuf,
    lock_path: PathBuf,
}

impl Storage {
    pub fn new() -> Result<Self, StorageError> {
        let app_dir = if let Ok(custom) = std::env::var("MQTT_TOPIC_LAB_DATA_DIR") {
            PathBuf::from(custom)
        } else {
            let data_dir = dirs::data_dir().ok_or(StorageError::NoAppDataDir)?;
            data_dir.join("mqtt-topic-lab")
        };

        if !app_dir.exists() {
            fs::create_dir_all(&app_dir)?;
        }

        Ok(Self {
            data_path: app_dir.join("data.json"),
            legacy_path: app_dir.join("project.json"),
            lock_path: app_dir.join("instance.lock"),
        })
    }

    /// Try to take the exclusive instance lock used to coordinate config writes
    /// between the running GUI and the CLI. Returns `Ok(Some(file))` when acquired
    /// (hold the file to keep the lock), or `Ok(None)` when another instance (the
    /// GUI, or another writer) already holds it.
    pub fn acquire_write_lock(&self) -> Result<Option<File>, StorageError> {
        let file = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .truncate(false)
            .open(&self.lock_path)?;
        match file.try_lock_exclusive() {
            Ok(()) => Ok(Some(file)),
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => Ok(None),
            Err(e) => Err(StorageError::Io(e)),
        }
    }

    pub fn load_data(&self) -> Result<AppData, StorageError> {
        if self.data_path.exists() {
            let content = fs::read_to_string(&self.data_path)?;
            let data: AppData = serde_json::from_str(&content)?;
            return Ok(data);
        }

        if self.legacy_path.exists() {
            let migrated = self.migrate_legacy()?;
            self.save_data(&migrated)?;
            fs::remove_file(&self.legacy_path)?;
            return Ok(migrated);
        }

        Ok(AppData::default())
    }

    fn migrate_legacy(&self) -> Result<AppData, StorageError> {
        let content = fs::read_to_string(&self.legacy_path)?;
        let legacy: LegacyProject = serde_json::from_str(&content)?;

        let connection_id = Uuid::new_v4().to_string();

        let connection = Connection {
            id: connection_id.clone(),
            name: legacy.name,
            broker_url: legacy.connection.broker_url,
            port: legacy.connection.port,
            client_id: legacy.connection.client_id,
            username: legacy.connection.username,
            password: legacy.connection.password,
            use_tls: legacy.connection.use_tls,
            auto_connect: legacy.connection.auto_connect,
            variables: legacy.variables,
            variable_history: HashMap::new(),
            buttons: legacy.buttons,
            groups: vec![],
            subscriptions: vec![],
        };

        Ok(AppData::new(vec![connection], Some(connection_id)))
    }

    pub fn save_data(&self, data: &AppData) -> Result<(), StorageError> {
        let content = serde_json::to_string_pretty(data)?;
        fs::write(&self.data_path, content)?;
        Ok(())
    }

    pub fn delete_data(&self) -> Result<(), StorageError> {
        if self.data_path.exists() {
            fs::remove_file(&self.data_path)?;
        }
        if self.legacy_path.exists() {
            fs::remove_file(&self.legacy_path)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Button, LegacyMqttConnection, QoS};
    use std::collections::HashMap;
    use tempfile::TempDir;

    fn create_test_storage(temp_dir: &TempDir) -> Storage {
        let app_dir = temp_dir.path().to_path_buf();
        Storage {
            data_path: app_dir.join("data.json"),
            legacy_path: app_dir.join("project.json"),
            lock_path: app_dir.join("instance.lock"),
        }
    }

    fn create_test_connection() -> Connection {
        Connection {
            id: "test-id".to_string(),
            name: "Test Connection".to_string(),
            broker_url: "localhost".to_string(),
            port: 1883,
            client_id: "test-client".to_string(),
            username: None,
            password: None,
            use_tls: false,
            auto_connect: true,
            variables: HashMap::from([("device_id".to_string(), "abc123".to_string())]),
            variable_history: HashMap::new(),
            buttons: vec![Button {
                id: "btn1".to_string(),
                name: "Test Button".to_string(),
                topic: "devices/{device_id}/CMD".to_string(),
                payload: Some("ON".to_string()),
                qos: QoS::AtLeastOnce,
                retain: false,
                color: None,
                multi_send_enabled: None,
                multi_send_interval: None,
                group_id: None,
            }],
            groups: vec![],
            subscriptions: vec![],
        }
    }

    fn create_legacy_project() -> LegacyProject {
        LegacyProject {
            name: "Legacy Project".to_string(),
            connection: LegacyMqttConnection {
                broker_url: "old-broker".to_string(),
                port: 1883,
                client_id: "old-client".to_string(),
                username: None,
                password: None,
                use_tls: false,
                auto_connect: true,
            },
            variables: HashMap::from([("old_var".to_string(), "old_value".to_string())]),
            buttons: vec![Button {
                id: "old-btn".to_string(),
                name: "Old Button".to_string(),
                topic: "old/topic".to_string(),
                payload: None,
                qos: QoS::AtMostOnce,
                retain: false,
                color: None,
                multi_send_enabled: None,
                multi_send_interval: None,
                group_id: None,
            }],
        }
    }

    #[test]
    fn test_load_empty_data() {
        let temp_dir = TempDir::new().unwrap();
        let storage = create_test_storage(&temp_dir);

        let result = storage.load_data().unwrap();
        assert!(result.connections.is_empty());
        assert!(result.last_connection_id.is_none());
    }

    #[test]
    fn test_save_and_load_data() {
        let temp_dir = TempDir::new().unwrap();
        let storage = create_test_storage(&temp_dir);

        let data = AppData::new(vec![create_test_connection()], Some("test-id".to_string()));

        storage.save_data(&data).unwrap();

        let loaded = storage.load_data().unwrap();
        assert_eq!(loaded.connections.len(), 1);
        assert_eq!(loaded.connections[0].name, "Test Connection");
        assert_eq!(loaded.last_connection_id, Some("test-id".to_string()));
    }

    #[test]
    fn test_migrate_legacy_project() {
        let temp_dir = TempDir::new().unwrap();
        let storage = create_test_storage(&temp_dir);

        let legacy = create_legacy_project();
        let content = serde_json::to_string_pretty(&legacy).unwrap();
        fs::write(&storage.legacy_path, content).unwrap();

        let loaded = storage.load_data().unwrap();

        assert_eq!(loaded.connections.len(), 1);
        assert_eq!(loaded.connections[0].name, "Legacy Project");
        assert_eq!(loaded.connections[0].broker_url, "old-broker");
        assert_eq!(
            loaded.connections[0].variables.get("old_var"),
            Some(&"old_value".to_string())
        );
        assert_eq!(loaded.connections[0].buttons.len(), 1);
        assert!(loaded.last_connection_id.is_some());
        assert!(!storage.legacy_path.exists());
        assert!(storage.data_path.exists());
    }

    #[test]
    fn test_write_lock_is_exclusive() {
        let temp_dir = TempDir::new().unwrap();
        let storage = create_test_storage(&temp_dir);

        let held = storage.acquire_write_lock().unwrap();
        assert!(held.is_some(), "first acquisition should succeed");

        let other = create_test_storage(&temp_dir);
        assert!(
            other.acquire_write_lock().unwrap().is_none(),
            "second acquisition should be blocked while the first is held"
        );

        drop(held);
        assert!(
            storage.acquire_write_lock().unwrap().is_some(),
            "acquisition should succeed again after release"
        );
    }

    #[test]
    fn test_delete_data() {
        let temp_dir = TempDir::new().unwrap();
        let storage = create_test_storage(&temp_dir);

        let data = AppData::new(vec![create_test_connection()], Some("test-id".to_string()));

        storage.save_data(&data).unwrap();
        assert!(storage.data_path.exists());

        storage.delete_data().unwrap();
        assert!(!storage.data_path.exists());
    }
}
