use crate::mqtt::{MqttClient, MqttEvents, Reconnect};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

pub type SharedClient = Arc<RwLock<MqttClient>>;

#[derive(Default)]
pub struct MqttClients {
    clients: RwLock<HashMap<String, SharedClient>>,
}

impl MqttClients {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn get_or_create(
        &self,
        label: &str,
        window_open: impl FnOnce() -> bool,
        events: impl FnOnce() -> Arc<dyn MqttEvents>,
    ) -> Option<SharedClient> {
        let mut clients = self.clients.write().await;
        if let Some(client) = clients.get(label) {
            return Some(Arc::clone(client));
        }
        if !window_open() {
            return None;
        }
        let mut client = MqttClient::new();
        client.set_events(events());
        client.set_reconnect(Reconnect::Keep);
        let client = Arc::new(RwLock::new(client));
        clients.insert(label.to_string(), Arc::clone(&client));
        Some(client)
    }

    pub async fn close(&self, label: &str) {
        let removed = self.clients.write().await.remove(label);
        if let Some(client) = removed {
            client.write().await.disconnect().await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mqtt::Message;
    use crate::types::Connection;
    use std::collections::HashMap;
    use std::sync::Mutex;

    #[derive(Default)]
    struct Recorder {
        statuses: Mutex<Vec<String>>,
    }

    impl MqttEvents for Recorder {
        fn on_status(&self, status: &str) {
            self.statuses.lock().unwrap().push(status.to_string());
        }

        fn on_message(&self, _message: &Message) {}
    }

    impl Recorder {
        fn statuses(&self) -> Vec<String> {
            self.statuses.lock().unwrap().clone()
        }
    }

    fn unreachable_connection() -> Connection {
        Connection {
            id: "c".to_string(),
            name: "Unreachable".to_string(),
            broker_url: "invalid.broker.local".to_string(),
            port: 1883,
            client_id: "test-client".to_string(),
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

    fn events(recorder: &Arc<Recorder>) -> impl FnOnce() -> Arc<dyn MqttEvents> {
        let recorder = Arc::clone(recorder);
        move || recorder
    }

    #[tokio::test]
    async fn the_same_window_gets_the_same_client() {
        let clients = MqttClients::new();
        let recorder = Arc::new(Recorder::default());

        let first = clients
            .get_or_create("main", || true, events(&recorder))
            .await
            .unwrap();
        let second = clients
            .get_or_create(
                "main",
                || true,
                || panic!("events must not be created twice"),
            )
            .await
            .unwrap();

        assert!(Arc::ptr_eq(&first, &second));
    }

    #[tokio::test]
    async fn each_window_gets_its_own_client() {
        let clients = MqttClients::new();
        let recorder = Arc::new(Recorder::default());

        let main = clients
            .get_or_create("main", || true, events(&recorder))
            .await
            .unwrap();
        let other = clients
            .get_or_create("window-2", || true, events(&recorder))
            .await
            .unwrap();

        assert!(!Arc::ptr_eq(&main, &other));
    }

    #[tokio::test]
    async fn status_events_reach_only_the_owning_window() {
        let clients = MqttClients::new();
        let main_events = Arc::new(Recorder::default());
        let other_events = Arc::new(Recorder::default());
        let main = clients
            .get_or_create("main", || true, events(&main_events))
            .await
            .unwrap();
        clients
            .get_or_create("window-2", || true, events(&other_events))
            .await
            .unwrap();

        main.write()
            .await
            .connect(&unreachable_connection())
            .await
            .unwrap();

        assert_eq!(
            main_events.statuses().first().map(String::as_str),
            Some("connecting")
        );
        assert!(other_events.statuses().is_empty());
        main.write().await.disconnect().await;
    }

    #[tokio::test]
    async fn close_disconnects_and_forgets_the_window() {
        let clients = MqttClients::new();
        let recorder = Arc::new(Recorder::default());
        let client = clients
            .get_or_create("main", || true, events(&recorder))
            .await
            .unwrap();
        client
            .write()
            .await
            .connect(&unreachable_connection())
            .await
            .unwrap();

        clients.close("main").await;

        assert!(recorder.statuses().contains(&"disconnected".to_string()));
        let fresh = clients
            .get_or_create("main", || true, events(&recorder))
            .await
            .unwrap();
        assert!(!Arc::ptr_eq(&client, &fresh));
    }

    #[tokio::test]
    async fn no_client_is_created_for_a_closed_window() {
        let clients = MqttClients::new();
        let recorder = Arc::new(Recorder::default());

        let client = clients
            .get_or_create("window-1", || false, events(&recorder))
            .await;

        assert!(client.is_none());
        let created = clients
            .get_or_create("window-1", || true, events(&recorder))
            .await;
        assert!(created.is_some());
    }

    #[tokio::test]
    async fn an_existing_client_is_returned_even_while_its_window_closes() {
        let clients = MqttClients::new();
        let recorder = Arc::new(Recorder::default());
        let first = clients
            .get_or_create("main", || true, events(&recorder))
            .await
            .unwrap();

        let again = clients
            .get_or_create(
                "main",
                || false,
                || panic!("events must not be created twice"),
            )
            .await
            .unwrap();

        assert!(Arc::ptr_eq(&first, &again));
    }

    #[tokio::test]
    async fn closing_an_unknown_window_does_nothing() {
        let clients = MqttClients::new();
        clients.close("never-opened").await;
    }
}
