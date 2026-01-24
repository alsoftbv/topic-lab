use crate::types::{Connection, ConnectionStatus, QoS};
use rumqttc::{AsyncClient, Event, MqttOptions, Packet, Transport};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use thiserror::Error;
use tokio::sync::{mpsc, RwLock};

const MAX_MESSAGES: usize = 100;

#[derive(Error, Debug)]
pub enum MqttError {
    #[error("Client error: {0}")]
    Client(#[from] rumqttc::ClientError),
    #[error("Connection error: {0}")]
    Connection(#[from] rumqttc::ConnectionError),
    #[error("Not connected")]
    NotConnected,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Message {
    pub topic: String,
    pub payload: String,
    pub timestamp: u64,
}

pub struct MqttClient {
    client: Option<AsyncClient>,
    status: Arc<RwLock<ConnectionStatus>>,
    shutdown_tx: Option<mpsc::Sender<()>>,
    connection_info: Option<(String, String)>,
    messages: Arc<RwLock<VecDeque<Message>>>,
    subscriptions: Arc<RwLock<Vec<String>>>,
    app_handle: Option<AppHandle>,
}

impl MqttClient {
    pub fn new() -> Self {
        Self {
            client: None,
            status: Arc::new(RwLock::new(ConnectionStatus::Disconnected)),
            shutdown_tx: None,
            connection_info: None,
            messages: Arc::new(RwLock::new(VecDeque::with_capacity(MAX_MESSAGES))),
            subscriptions: Arc::new(RwLock::new(Vec::new())),
            app_handle: None,
        }
    }

    pub fn set_app_handle(&mut self, handle: AppHandle) {
        self.app_handle = Some(handle);
    }

    pub async fn connect(&mut self, config: &Connection) -> Result<(), MqttError> {
        if self.client.is_some() {
            return Ok(());
        }

        *self.status.write().await = ConnectionStatus::Connecting;
        if let Some(ref handle) = self.app_handle {
            let _ = handle.emit("mqtt-status", "connecting");
        }
        self.messages.write().await.clear();
        self.subscriptions.write().await.clear();

        let broker_host = strip_protocol(&config.broker_url);

        let mut mqtt_options = MqttOptions::new(&config.client_id, broker_host, config.port);

        mqtt_options.set_keep_alive(Duration::from_secs(30));

        if let (Some(username), Some(password)) = (&config.username, &config.password) {
            mqtt_options.set_credentials(username, password);
        }

        if config.use_tls {
            let transport = Transport::tls_with_default_config();
            mqtt_options.set_transport(transport);
        }

        let (client, mut eventloop) = AsyncClient::new(mqtt_options, 10);
        self.client = Some(client);
        self.connection_info = Some((config.name.clone(), config.broker_url.clone()));

        let status = Arc::clone(&self.status);
        let messages = Arc::clone(&self.messages);
        let app_handle = self.app_handle.clone();
        let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);
        self.shutdown_tx = Some(shutdown_tx);

        tokio::spawn(async move {
            let mut consecutive_errors = 0;
            const MAX_CONSECUTIVE_ERRORS: u32 = 5;

            loop {
                tokio::select! {
                    _ = shutdown_rx.recv() => {
                        break;
                    }
                    event = eventloop.poll() => {
                        match event {
                            Ok(Event::Incoming(Packet::ConnAck(_))) => {
                                *status.write().await = ConnectionStatus::Connected;
                                consecutive_errors = 0;
                                if let Some(ref handle) = app_handle {
                                    let _ = handle.emit("mqtt-status", "connected");
                                }
                            }
                            Ok(Event::Incoming(Packet::Publish(publish))) => {
                                consecutive_errors = 0;
                                let payload = String::from_utf8_lossy(&publish.payload).to_string();
                                let msg = Message {
                                    topic: publish.topic.clone(),
                                    payload,
                                    timestamp: std::time::SystemTime::now()
                                        .duration_since(std::time::UNIX_EPOCH)
                                        .unwrap_or_default()
                                        .as_millis() as u64,
                                };
                                let mut msgs = messages.write().await;
                                if msgs.len() >= MAX_MESSAGES {
                                    msgs.pop_front();
                                }
                                msgs.push_back(msg.clone());
                                if let Some(ref handle) = app_handle {
                                    let _ = handle.emit("mqtt-message", msg);
                                }
                            }
                            Ok(_) => {
                                consecutive_errors = 0;
                            }
                            Err(e) => {
                                consecutive_errors += 1;
                                eprintln!("MQTT connection error ({}/{}): {}", consecutive_errors, MAX_CONSECUTIVE_ERRORS, e);

                                *status.write().await = ConnectionStatus::Error;
                                if let Some(ref handle) = app_handle {
                                    let _ = handle.emit("mqtt-status", "error");
                                }

                                if consecutive_errors >= MAX_CONSECUTIVE_ERRORS {
                                    eprintln!("MQTT: Too many consecutive errors, giving up");
                                    break;
                                }

                                // Small delay before retry
                                tokio::time::sleep(Duration::from_millis(500)).await;
                            }
                        }
                    }
                }
            }
        });

        tokio::time::sleep(Duration::from_millis(500)).await;

        Ok(())
    }

    pub async fn disconnect(&mut self) -> Result<Option<(String, String)>, MqttError> {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(()).await;
        }

        if let Some(client) = self.client.take() {
            let _ = client.disconnect().await;
        }

        self.subscriptions.write().await.clear();
        let info = self.connection_info.take();
        *self.status.write().await = ConnectionStatus::Disconnected;
        if let Some(ref handle) = self.app_handle {
            let _ = handle.emit("mqtt-status", "disconnected");
        }
        Ok(info)
    }

    pub async fn subscribe(&self, topic: &str, qos: QoS) -> Result<(), MqttError> {
        let client = self.client.as_ref().ok_or(MqttError::NotConnected)?;
        client.subscribe(topic, qos.into()).await?;
        let mut subs = self.subscriptions.write().await;
        if !subs.contains(&topic.to_string()) {
            subs.push(topic.to_string());
        }
        Ok(())
    }

    pub async fn unsubscribe(&self, topic: &str) -> Result<(), MqttError> {
        let client = self.client.as_ref().ok_or(MqttError::NotConnected)?;
        client.unsubscribe(topic).await?;
        self.subscriptions.write().await.retain(|t| t != topic);
        Ok(())
    }

    pub async fn publish(
        &self,
        topic: &str,
        payload: &str,
        qos: QoS,
        retain: bool,
    ) -> Result<(), MqttError> {
        let client = self.client.as_ref().ok_or(MqttError::NotConnected)?;
        client
            .publish(topic, qos.into(), retain, payload.as_bytes())
            .await?;
        Ok(())
    }

    #[cfg(test)]
    pub async fn get_status(&self) -> ConnectionStatus {
        self.status.read().await.clone()
    }

    pub async fn get_messages(&self) -> Vec<Message> {
        self.messages.read().await.iter().cloned().collect()
    }

    pub async fn clear_messages(&self) {
        self.messages.write().await.clear();
    }

    pub async fn get_subscriptions(&self) -> Vec<String> {
        self.subscriptions.read().await.clone()
    }
}

impl Default for MqttClient {
    fn default() -> Self {
        Self::new()
    }
}

fn strip_protocol(url: &str) -> &str {
    let url = url.trim();
    for prefix in ["mqtt://", "mqtts://", "tcp://", "ssl://", "ws://", "wss://"] {
        if let Some(stripped) = url.strip_prefix(prefix) {
            return stripped;
        }
    }
    url
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_connection(broker_url: &str, port: u16) -> Connection {
        Connection {
            id: "test-id".to_string(),
            name: "Test Connection".to_string(),
            broker_url: broker_url.to_string(),
            port,
            client_id: format!("test-client-{}", std::process::id()),
            username: None,
            password: None,
            use_tls: false,
            auto_connect: false,
            variables: std::collections::HashMap::new(),
            buttons: vec![],
            subscriptions: vec![],
        }
    }

    #[test]
    fn test_mqtt_client_initial_status() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let client = MqttClient::new();
            let status = client.get_status().await;
            assert_eq!(status, ConnectionStatus::Disconnected);
        });
    }

    #[test]
    fn test_mqtt_client_default() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let client = MqttClient::default();
            let status = client.get_status().await;
            assert_eq!(status, ConnectionStatus::Disconnected);
        });
    }

    #[test]
    fn test_publish_without_connection_fails() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let client = MqttClient::new();
            let result = client
                .publish("test/topic", "payload", QoS::AtMostOnce, false)
                .await;
            assert!(matches!(result, Err(MqttError::NotConnected)));
        });
    }

    #[test]
    fn test_subscribe_without_connection_fails() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let client = MqttClient::new();
            let result = client.subscribe("test/topic", QoS::AtMostOnce).await;
            assert!(matches!(result, Err(MqttError::NotConnected)));
        });
    }

    #[test]
    fn test_disconnect_without_connection() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let mut client = MqttClient::new();
            let result = client.disconnect().await;
            assert!(result.is_ok());
            assert_eq!(client.get_status().await, ConnectionStatus::Disconnected);
        });
    }

    #[test]
    fn test_messages_empty_initially() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let client = MqttClient::new();
            let messages = client.get_messages().await;
            assert!(messages.is_empty());
        });
    }

    #[test]
    fn test_subscriptions_empty_initially() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let client = MqttClient::new();
            let subs = client.get_subscriptions().await;
            assert!(subs.is_empty());
        });
    }

    #[test]
    fn test_connect_sets_connecting_status() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let mut client = MqttClient::new();
            let config = create_test_connection("invalid.broker.local", 1883);
            let _ = client.connect(&config).await;
            let status = client.get_status().await;
            assert!(
                status == ConnectionStatus::Connecting || status == ConnectionStatus::Error,
                "Expected Connecting or Error, got {:?}",
                status
            );
            let _ = client.disconnect().await;
        });
    }

    #[test]
    fn test_connect_to_invalid_broker_eventually_errors() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let mut client = MqttClient::new();
            let config = create_test_connection("nonexistent.invalid.host", 1883);
            let _ = client.connect(&config).await;
            tokio::time::sleep(Duration::from_secs(1)).await;
            let status = client.get_status().await;
            assert_eq!(status, ConnectionStatus::Error);
            let _ = client.disconnect().await;
        });
    }

    #[test]
    fn test_disconnect_resets_status() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let mut client = MqttClient::new();
            let config = create_test_connection("invalid.broker.local", 1883);
            let _ = client.connect(&config).await;
            let _ = client.disconnect().await;
            assert_eq!(client.get_status().await, ConnectionStatus::Disconnected);
        });
    }

    #[test]
    fn test_connect_already_connected_noop() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let mut client = MqttClient::new();
            let config = create_test_connection("invalid.broker.local", 1883);
            let result1 = client.connect(&config).await;
            assert!(result1.is_ok());
            let result2 = client.connect(&config).await;
            assert!(result2.is_ok());
            let _ = client.disconnect().await;
        });
    }

    #[test]
    fn test_qos_conversion() {
        assert_eq!(
            rumqttc::QoS::from(QoS::AtMostOnce),
            rumqttc::QoS::AtMostOnce
        );
        assert_eq!(
            rumqttc::QoS::from(QoS::AtLeastOnce),
            rumqttc::QoS::AtLeastOnce
        );
        assert_eq!(
            rumqttc::QoS::from(QoS::ExactlyOnce),
            rumqttc::QoS::ExactlyOnce
        );
    }

    #[test]
    fn test_strip_protocol() {
        assert_eq!(
            strip_protocol("mqtt://broker.example.com"),
            "broker.example.com"
        );
        assert_eq!(
            strip_protocol("mqtts://broker.example.com"),
            "broker.example.com"
        );
        assert_eq!(
            strip_protocol("tcp://broker.example.com"),
            "broker.example.com"
        );
        assert_eq!(
            strip_protocol("ssl://broker.example.com"),
            "broker.example.com"
        );
        assert_eq!(
            strip_protocol("ws://broker.example.com"),
            "broker.example.com"
        );
        assert_eq!(
            strip_protocol("wss://broker.example.com"),
            "broker.example.com"
        );
        assert_eq!(strip_protocol("broker.example.com"), "broker.example.com");
        assert_eq!(
            strip_protocol("  mqtt://broker.example.com  "),
            "broker.example.com"
        );
        assert_eq!(
            strip_protocol("  broker.example.com  "),
            "broker.example.com"
        );
        assert_eq!(
            strip_protocol("\tmqtt://broker.example.com\n"),
            "broker.example.com"
        );
        assert_eq!(strip_protocol(""), "");
        assert_eq!(strip_protocol("   "), "");
        assert_eq!(strip_protocol("mqtt://"), "");
        assert_eq!(
            strip_protocol("http://broker.example.com"),
            "http://broker.example.com"
        );
        assert_eq!(
            strip_protocol("ftp://broker.example.com"),
            "ftp://broker.example.com"
        );
    }

    #[test]
    fn test_mqtt_error_display() {
        let not_connected = MqttError::NotConnected;
        assert_eq!(format!("{}", not_connected), "Not connected");
    }
}
