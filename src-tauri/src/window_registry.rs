use serde::Serialize;
use std::collections::BTreeMap;
use std::sync::{Mutex, MutexGuard};

pub const MAIN_WINDOW: &str = "main";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenConnection {
    pub label: String,
    pub connection_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum Claim {
    Claimed,
    #[serde(rename_all = "camelCase")]
    OpenElsewhere {
        label: String,
    },
}

#[derive(Debug, PartialEq, Eq)]
pub struct WindowClosed;

#[derive(Default)]
struct Inner {
    next_window: u64,
    windows: BTreeMap<String, Option<String>>,
}

#[derive(Default)]
pub struct WindowRegistry {
    inner: Mutex<Inner>,
}

impl WindowRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn next_label(&self) -> String {
        let mut inner = self.lock();
        inner.next_window += 1;
        format!("window-{}", inner.next_window)
    }

    pub fn register(&self, label: &str, connection_id: Option<String>) {
        self.lock().windows.insert(label.to_string(), connection_id);
    }

    pub fn remove(&self, label: &str) {
        self.lock().windows.remove(label);
    }

    pub fn contains(&self, label: &str) -> bool {
        self.lock().windows.contains_key(label)
    }

    pub fn connection_of(&self, label: &str) -> Option<String> {
        self.lock().windows.get(label).cloned().flatten()
    }

    pub fn claim(&self, label: &str, connection_id: &str) -> Result<Claim, WindowClosed> {
        let mut inner = self.lock();
        if !inner.windows.contains_key(label) {
            return Err(WindowClosed);
        }
        let owner = inner
            .windows
            .iter()
            .find(|(other, open)| other.as_str() != label && open.as_deref() == Some(connection_id))
            .map(|(other, _)| other.clone());
        if let Some(owner) = owner {
            return Ok(Claim::OpenElsewhere { label: owner });
        }
        inner
            .windows
            .insert(label.to_string(), Some(connection_id.to_string()));
        Ok(Claim::Claimed)
    }

    pub fn release_connection(&self, connection_id: &str) -> Vec<String> {
        let mut inner = self.lock();
        let mut released = Vec::new();
        for (label, open) in inner.windows.iter_mut() {
            if open.as_deref() == Some(connection_id) {
                *open = None;
                released.push(label.clone());
            }
        }
        released
    }

    pub fn open_connections(&self) -> Vec<OpenConnection> {
        self.lock()
            .windows
            .iter()
            .filter_map(|(label, open)| {
                open.as_ref().map(|id| OpenConnection {
                    label: label.clone(),
                    connection_id: id.clone(),
                })
            })
            .collect()
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn labels_are_unique_and_never_main() {
        let registry = WindowRegistry::new();
        let first = registry.next_label();
        let second = registry.next_label();
        assert_ne!(first, second);
        assert_ne!(first, MAIN_WINDOW);
        assert!(first.starts_with("window-"));
    }

    #[test]
    fn a_registered_window_reports_its_connection() {
        let registry = WindowRegistry::new();
        registry.register(MAIN_WINDOW, Some("a".into()));
        registry.register("window-1", None);

        assert_eq!(registry.connection_of(MAIN_WINDOW).as_deref(), Some("a"));
        assert_eq!(registry.connection_of("window-1"), None);
        assert_eq!(registry.connection_of("unknown"), None);
    }

    #[test]
    fn claiming_a_free_connection_succeeds_and_replaces_the_previous_one() {
        let registry = WindowRegistry::new();
        registry.register(MAIN_WINDOW, Some("a".into()));

        registry.register("window-1", None);

        assert_eq!(registry.claim(MAIN_WINDOW, "b"), Ok(Claim::Claimed));

        assert_eq!(registry.connection_of(MAIN_WINDOW).as_deref(), Some("b"));
        assert_eq!(registry.claim("window-1", "a"), Ok(Claim::Claimed));
    }

    #[test]
    fn claiming_a_connection_open_in_another_window_is_refused() {
        let registry = WindowRegistry::new();
        registry.register(MAIN_WINDOW, Some("a".into()));
        registry.register("window-1", Some("b".into()));

        assert_eq!(
            registry.claim("window-1", "a"),
            Ok(Claim::OpenElsewhere {
                label: MAIN_WINDOW.into()
            })
        );
        assert_eq!(registry.connection_of("window-1").as_deref(), Some("b"));
    }

    #[test]
    fn reclaiming_the_own_connection_is_fine() {
        let registry = WindowRegistry::new();
        registry.register(MAIN_WINDOW, Some("a".into()));

        assert_eq!(registry.claim(MAIN_WINDOW, "a"), Ok(Claim::Claimed));
    }

    #[test]
    fn a_closed_window_cannot_claim() {
        let registry = WindowRegistry::new();
        registry.register("window-1", None);
        registry.remove("window-1");

        assert_eq!(registry.claim("window-1", "a"), Err(WindowClosed));
        assert!(registry.open_connections().is_empty());
        assert!(!registry.contains("window-1"));
    }

    #[test]
    fn releasing_a_deleted_connection_frees_every_window_that_had_it() {
        let registry = WindowRegistry::new();
        registry.register(MAIN_WINDOW, Some("a".into()));
        registry.register("window-1", Some("b".into()));

        assert_eq!(
            registry.release_connection("a"),
            vec![MAIN_WINDOW.to_string()]
        );
        assert_eq!(registry.connection_of(MAIN_WINDOW), None);
        assert_eq!(registry.connection_of("window-1").as_deref(), Some("b"));
        assert!(registry.release_connection("missing").is_empty());
    }

    #[test]
    fn removing_a_window_frees_its_connection() {
        let registry = WindowRegistry::new();
        registry.register("window-1", Some("a".into()));

        registry.register("window-2", None);

        registry.remove("window-1");

        assert!(registry.open_connections().is_empty());
        assert_eq!(registry.claim("window-2", "a"), Ok(Claim::Claimed));
    }

    #[test]
    fn open_connections_lists_only_windows_with_a_connection() {
        let registry = WindowRegistry::new();
        registry.register(MAIN_WINDOW, Some("a".into()));
        registry.register("window-1", None);
        registry.register("window-2", Some("b".into()));

        assert_eq!(
            registry.open_connections(),
            vec![
                OpenConnection {
                    label: MAIN_WINDOW.into(),
                    connection_id: "a".into()
                },
                OpenConnection {
                    label: "window-2".into(),
                    connection_id: "b".into()
                },
            ]
        );
    }

    #[test]
    fn claim_serializes_for_the_frontend() {
        assert_eq!(
            serde_json::to_value(Claim::Claimed).unwrap(),
            json!({"status": "claimed"})
        );
        assert_eq!(
            serde_json::to_value(Claim::OpenElsewhere {
                label: "main".into()
            })
            .unwrap(),
            json!({"status": "openElsewhere", "label": "main"})
        );
        assert_eq!(
            serde_json::to_value(OpenConnection {
                label: "main".into(),
                connection_id: "a".into()
            })
            .unwrap(),
            json!({"label": "main", "connectionId": "a"})
        );
    }
}
