use crate::storage::{Storage, StorageError};
use crate::types::{AppData, Connection};
use serde::Serialize;
use serde_json::{Map, Value};
use std::sync::{Mutex, MutexGuard};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum StoreError {
    #[error(transparent)]
    Storage(#[from] StorageError),
    #[error("Invalid settings: {0}")]
    InvalidSettings(serde_json::Error),
    #[error("Connection not found: {0}")]
    ConnectionNotFound(String),
}

#[derive(Debug, Clone, Serialize)]
pub struct DataSnapshot {
    pub revision: u64,
    pub data: AppData,
}

struct State {
    data: Option<AppData>,
    revision: u64,
}

pub struct DataStore {
    storage: Storage,
    state: Mutex<State>,
}

impl DataStore {
    pub fn new(storage: Storage) -> Self {
        Self {
            storage,
            state: Mutex::new(State {
                data: None,
                revision: 0,
            }),
        }
    }

    pub fn storage(&self) -> &Storage {
        &self.storage
    }

    pub fn snapshot(&self) -> Result<DataSnapshot, StoreError> {
        let mut state = self.lock();
        let data = self.current(&mut state)?;
        Ok(DataSnapshot {
            revision: state.revision,
            data,
        })
    }

    pub fn save_connection(&self, connection: Connection) -> Result<DataSnapshot, StoreError> {
        self.modify(|data| {
            match data.connections.iter_mut().find(|c| c.id == connection.id) {
                Some(existing) => *existing = connection,
                None => data.connections.push(connection),
            }
            Ok(())
        })
    }

    pub fn delete_connection(&self, id: &str) -> Result<DataSnapshot, StoreError> {
        self.modify(|data| {
            data.connections.retain(|c| c.id != id);
            if data.last_connection_id.as_deref() == Some(id) {
                data.last_connection_id = data.connections.first().map(|c| c.id.clone());
            }
            Ok(())
        })
    }

    pub fn reorder_connections(&self, ids: &[String]) -> Result<DataSnapshot, StoreError> {
        self.modify(|data| {
            let mut remaining = std::mem::take(&mut data.connections);
            let mut ordered = Vec::with_capacity(remaining.len());
            for id in ids {
                if let Some(pos) = remaining.iter().position(|c| &c.id == id) {
                    ordered.push(remaining.remove(pos));
                }
            }
            ordered.extend(remaining);
            data.connections = ordered;
            Ok(())
        })
    }

    pub fn set_last_connection(&self, id: &str) -> Result<DataSnapshot, StoreError> {
        self.modify(|data| {
            if !data.connections.iter().any(|c| c.id == id) {
                return Err(StoreError::ConnectionNotFound(id.to_string()));
            }
            data.last_connection_id = Some(id.to_string());
            Ok(())
        })
    }

    pub fn remember_last_connection(&self, id: &str) -> Result<Option<DataSnapshot>, StoreError> {
        let unchanged = {
            let mut state = self.lock();
            self.current(&mut state)?.last_connection_id.as_deref() == Some(id)
        };
        if unchanged {
            return Ok(None);
        }
        self.set_last_connection(id).map(Some)
    }

    pub fn update_settings(&self, patch: Map<String, Value>) -> Result<DataSnapshot, StoreError> {
        self.modify(|data| {
            let mut merged =
                match serde_json::to_value(&data.settings).map_err(StoreError::InvalidSettings)? {
                    Value::Object(map) => map,
                    _ => Map::new(),
                };
            for (key, value) in patch {
                if value.is_null() {
                    merged.remove(&key);
                } else {
                    merged.insert(key, value);
                }
            }
            data.settings = serde_json::from_value(Value::Object(merged))
                .map_err(StoreError::InvalidSettings)?;
            Ok(())
        })
    }

    pub fn reset(&self) -> Result<DataSnapshot, StoreError> {
        let mut state = self.lock();
        self.storage.delete_data()?;
        let data = AppData::default();
        state.data = Some(data.clone());
        state.revision += 1;
        Ok(DataSnapshot {
            revision: state.revision,
            data,
        })
    }

    fn lock(&self) -> MutexGuard<'_, State> {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn current(&self, state: &mut State) -> Result<AppData, StoreError> {
        match &state.data {
            Some(data) => Ok(data.clone()),
            None => {
                let data = self.storage.load_data()?;
                state.data = Some(data.clone());
                Ok(data)
            }
        }
    }

    fn modify(
        &self,
        change: impl FnOnce(&mut AppData) -> Result<(), StoreError>,
    ) -> Result<DataSnapshot, StoreError> {
        let mut state = self.lock();
        let mut data = self.current(&mut state)?;
        change(&mut data)?;
        self.storage.save_data(&data)?;
        state.data = Some(data.clone());
        state.revision += 1;
        Ok(DataSnapshot {
            revision: state.revision,
            data,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::HashMap;
    use std::fs;
    use tempfile::TempDir;

    fn store_in(dir: &TempDir) -> DataStore {
        DataStore::new(Storage::in_dir(dir.path().to_path_buf()))
    }

    fn connection(id: &str) -> Connection {
        Connection {
            id: id.to_string(),
            name: format!("Connection {id}"),
            broker_url: "localhost".to_string(),
            port: 1883,
            client_id: format!("client-{id}"),
            username: None,
            password: None,
            use_tls: false,
            ca_cert_path: None,
            client_cert_path: None,
            client_key_path: None,
            auto_connect: false,
            variables: HashMap::new(),
            variable_history: HashMap::new(),
            buttons: vec![],
            groups: vec![],
            subscriptions: vec![],
        }
    }

    fn ids(snapshot: &DataSnapshot) -> Vec<&str> {
        snapshot
            .data
            .connections
            .iter()
            .map(|c| c.id.as_str())
            .collect()
    }

    fn on_disk(dir: &TempDir) -> AppData {
        Storage::in_dir(dir.path().to_path_buf())
            .load_data()
            .unwrap()
    }

    fn patch(value: Value) -> Map<String, Value> {
        match value {
            Value::Object(map) => map,
            _ => panic!("patch must be an object"),
        }
    }

    fn store_with(dir: &TempDir, connection_ids: &[&str]) -> DataStore {
        let store = store_in(dir);
        for id in connection_ids {
            store.save_connection(connection(id)).unwrap();
        }
        store
    }

    #[test]
    fn snapshot_loads_existing_data_at_revision_zero() {
        let dir = TempDir::new().unwrap();
        Storage::in_dir(dir.path().to_path_buf())
            .save_data(&AppData::new(vec![connection("a")], Some("a".into())))
            .unwrap();

        let snapshot = store_in(&dir).snapshot().unwrap();

        assert_eq!(snapshot.revision, 0);
        assert_eq!(ids(&snapshot), vec!["a"]);
        assert_eq!(snapshot.data.last_connection_id.as_deref(), Some("a"));
    }

    #[test]
    fn snapshot_of_missing_file_is_empty() {
        let dir = TempDir::new().unwrap();
        let snapshot = store_in(&dir).snapshot().unwrap();
        assert!(snapshot.data.connections.is_empty());
    }

    #[test]
    fn save_connection_appends_new_and_replaces_existing_in_place() {
        let dir = TempDir::new().unwrap();
        let store = store_with(&dir, &["a", "b"]);

        let mut renamed = connection("a");
        renamed.name = "Renamed".into();
        let snapshot = store.save_connection(renamed).unwrap();

        assert_eq!(ids(&snapshot), vec!["a", "b"]);
        assert_eq!(snapshot.data.connections[0].name, "Renamed");
        assert_eq!(snapshot.revision, 3);
        assert_eq!(on_disk(&dir).connections[0].name, "Renamed");
    }

    #[test]
    fn every_write_persists_and_bumps_the_revision() {
        let dir = TempDir::new().unwrap();
        let store = store_in(&dir);

        let first = store.save_connection(connection("a")).unwrap();
        let second = store.set_last_connection("a").unwrap();

        assert_eq!(first.revision, 1);
        assert_eq!(second.revision, 2);
        assert_eq!(store.snapshot().unwrap().revision, 2);
        assert_eq!(on_disk(&dir).last_connection_id.as_deref(), Some("a"));
    }

    #[test]
    fn delete_connection_moves_last_connection_to_the_first_remaining() {
        let dir = TempDir::new().unwrap();
        let store = store_with(&dir, &["a", "b", "c"]);
        store.set_last_connection("b").unwrap();

        let snapshot = store.delete_connection("b").unwrap();

        assert_eq!(ids(&snapshot), vec!["a", "c"]);
        assert_eq!(snapshot.data.last_connection_id.as_deref(), Some("a"));
        assert_eq!(on_disk(&dir).connections.len(), 2);
    }

    #[test]
    fn delete_connection_keeps_an_unrelated_last_connection() {
        let dir = TempDir::new().unwrap();
        let store = store_with(&dir, &["a", "b"]);
        store.set_last_connection("b").unwrap();

        let snapshot = store.delete_connection("a").unwrap();

        assert_eq!(snapshot.data.last_connection_id.as_deref(), Some("b"));
    }

    #[test]
    fn deleting_the_only_connection_clears_last_connection() {
        let dir = TempDir::new().unwrap();
        let store = store_with(&dir, &["a"]);
        store.set_last_connection("a").unwrap();

        let snapshot = store.delete_connection("a").unwrap();

        assert!(snapshot.data.connections.is_empty());
        assert_eq!(snapshot.data.last_connection_id, None);
    }

    #[test]
    fn reorder_follows_the_given_ids() {
        let dir = TempDir::new().unwrap();
        let store = store_with(&dir, &["a", "b", "c"]);

        let snapshot = store
            .reorder_connections(&["c".into(), "a".into(), "b".into()])
            .unwrap();

        assert_eq!(ids(&snapshot), vec!["c", "a", "b"]);
        assert_eq!(
            on_disk(&dir)
                .connections
                .iter()
                .map(|c| c.id.clone())
                .collect::<Vec<_>>(),
            vec!["c", "a", "b"]
        );
    }

    #[test]
    fn reorder_keeps_connections_missing_from_the_ids_and_skips_unknown_ids() {
        let dir = TempDir::new().unwrap();
        let store = store_with(&dir, &["a", "b", "c"]);

        let snapshot = store
            .reorder_connections(&["c".into(), "gone".into(), "a".into()])
            .unwrap();

        assert_eq!(ids(&snapshot), vec!["c", "a", "b"]);
    }

    #[test]
    fn set_last_connection_rejects_unknown_ids_without_writing() {
        let dir = TempDir::new().unwrap();
        let store = store_with(&dir, &["a"]);

        let result = store.set_last_connection("missing");

        assert!(matches!(result, Err(StoreError::ConnectionNotFound(_))));
        assert_eq!(store.snapshot().unwrap().revision, 1);
        assert_eq!(on_disk(&dir).last_connection_id, None);
    }

    #[test]
    fn remember_last_connection_writes_only_when_it_changes() {
        let dir = TempDir::new().unwrap();
        let store = store_with(&dir, &["a", "b"]);
        store.set_last_connection("a").unwrap();

        assert!(store.remember_last_connection("a").unwrap().is_none());
        assert_eq!(store.snapshot().unwrap().revision, 3);

        let snapshot = store.remember_last_connection("b").unwrap().unwrap();
        assert_eq!(snapshot.data.last_connection_id.as_deref(), Some("b"));
        assert_eq!(snapshot.revision, 4);
        assert_eq!(on_disk(&dir).last_connection_id.as_deref(), Some("b"));
    }

    #[test]
    fn update_settings_merges_the_patch() {
        let dir = TempDir::new().unwrap();
        let store = store_in(&dir);
        store
            .update_settings(patch(json!({"autoCheckUpdates": true})))
            .unwrap();

        let snapshot = store
            .update_settings(patch(json!({"lastSeenVersion": "0.5.0"})))
            .unwrap();

        assert_eq!(snapshot.data.settings.auto_check_updates, Some(true));
        assert_eq!(
            snapshot.data.settings.last_seen_version.as_deref(),
            Some("0.5.0")
        );
        assert_eq!(on_disk(&dir).settings.auto_check_updates, Some(true));
    }

    #[test]
    fn update_settings_null_clears_a_field() {
        let dir = TempDir::new().unwrap();
        let store = store_in(&dir);
        store
            .update_settings(patch(
                json!({"autoCheckUpdates": true, "showReleaseNotes": false}),
            ))
            .unwrap();

        let snapshot = store
            .update_settings(patch(json!({"showReleaseNotes": null})))
            .unwrap();

        assert_eq!(snapshot.data.settings.show_release_notes, None);
        assert_eq!(snapshot.data.settings.auto_check_updates, Some(true));
    }

    #[test]
    fn update_settings_rejects_wrong_types_without_writing() {
        let dir = TempDir::new().unwrap();
        let store = store_in(&dir);
        store
            .update_settings(patch(json!({"autoCheckUpdates": true})))
            .unwrap();

        let result = store.update_settings(patch(json!({"autoCheckUpdates": "yes"})));

        assert!(matches!(result, Err(StoreError::InvalidSettings(_))));
        let snapshot = store.snapshot().unwrap();
        assert_eq!(snapshot.revision, 1);
        assert_eq!(snapshot.data.settings.auto_check_updates, Some(true));
    }

    #[test]
    fn writes_never_overwrite_a_file_that_failed_to_load() {
        let dir = TempDir::new().unwrap();
        let data_path = dir.path().join("data.json");
        fs::write(&data_path, "{ not json").unwrap();
        let store = store_in(&dir);

        assert!(store.snapshot().is_err());
        assert!(store.save_connection(connection("a")).is_err());
        assert!(store
            .update_settings(patch(json!({"autoCheckUpdates": true})))
            .is_err());
        assert_eq!(fs::read_to_string(&data_path).unwrap(), "{ not json");
    }

    #[cfg(unix)]
    #[test]
    fn a_failed_disk_write_leaves_memory_unchanged() {
        use std::os::unix::fs::PermissionsExt;

        let dir = TempDir::new().unwrap();
        let store = store_with(&dir, &["a"]);
        fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o555)).unwrap();

        let result = store.save_connection(connection("b"));

        fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o755)).unwrap();
        assert!(result.is_err());
        let snapshot = store.snapshot().unwrap();
        assert_eq!(ids(&snapshot), vec!["a"]);
        assert_eq!(snapshot.revision, 1);
    }

    #[test]
    fn reset_deletes_the_file_and_empties_the_data() {
        let dir = TempDir::new().unwrap();
        let store = store_with(&dir, &["a"]);

        let snapshot = store.reset().unwrap();

        assert!(snapshot.data.connections.is_empty());
        assert_eq!(snapshot.revision, 2);
        assert!(!dir.path().join("data.json").exists());
        assert_eq!(store.snapshot().unwrap().revision, 2);
    }

    #[test]
    fn reset_recovers_from_a_file_that_failed_to_load() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("data.json"), "{ not json").unwrap();
        let store = store_in(&dir);
        assert!(store.snapshot().is_err());

        store.reset().unwrap();

        assert!(store.save_connection(connection("a")).is_ok());
        assert_eq!(on_disk(&dir).connections.len(), 1);
    }
}
