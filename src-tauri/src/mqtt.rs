use crate::types::{Connection, ConnectionStatus, QoS};
use log::{debug, error, info, warn};
use rumqttc::{AsyncClient, Event, MqttOptions, Packet, TlsConfiguration, Transport};
use rustls::{ClientConfig, RootCertStore};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Arc;
use std::time::Duration;
use thiserror::Error;
use tokio::sync::{mpsc, RwLock};

const MAX_MESSAGES: usize = 100;

pub trait MqttEvents: Send + Sync {
    fn on_status(&self, status: &str);
    fn on_message(&self, message: &Message);
}

#[derive(Error, Debug)]
pub enum MqttError {
    #[error("Client error: {0}")]
    Client(#[from] rumqttc::ClientError),
    #[error("Connection error: {0}")]
    Connection(#[from] rumqttc::ConnectionError),
    #[error("Not connected")]
    NotConnected,
    #[error("Connection failed")]
    ConnectionFailed,
    #[error("Timed out waiting for connection")]
    Timeout,
    #[error("WebSocket brokers are not supported; use mqtt:// or mqtts://")]
    WebsocketUnsupported,
    #[error("Client certificate and client key must both be set")]
    IncompleteClientAuth,
    #[error("TLS setup failed: {0}")]
    TlsSetup(String),
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
    subscriptions: Arc<RwLock<Vec<(String, QoS)>>>,
    events: Option<Arc<dyn MqttEvents>>,
    eventloop_task: Option<tokio::task::JoinHandle<()>>,
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
            events: None,
            eventloop_task: None,
        }
    }

    pub fn set_events(&mut self, events: Arc<dyn MqttEvents>) {
        self.events = Some(events);
    }

    pub async fn connect(&mut self, config: &Connection) -> Result<(), MqttError> {
        if self.client.is_some() {
            if self.is_running() {
                debug!("Already connected, skipping connect");
                return Ok(());
            }
            self.disconnect().await;
        }

        let broker_url = config.broker_url.trim();
        if broker_url.starts_with("ws://") || broker_url.starts_with("wss://") {
            return Err(MqttError::WebsocketUnsupported);
        }

        let tls_transport = if config.use_tls {
            Some(build_tls_transport(config)?)
        } else {
            None
        };

        info!(
            "Connecting to {} ({}:{})",
            config.name, config.broker_url, config.port
        );
        *self.status.write().await = ConnectionStatus::Connecting;
        if let Some(ref events) = self.events {
            events.on_status("connecting");
        }
        self.messages.write().await.clear();
        self.subscriptions.write().await.clear();

        let broker_host = strip_protocol(&config.broker_url);

        let mut mqtt_options = MqttOptions::new(&config.client_id, broker_host, config.port);

        mqtt_options.set_keep_alive(Duration::from_secs(30));

        if let (Some(username), Some(password)) = (&config.username, &config.password) {
            mqtt_options.set_credentials(username, password);
        }

        if let Some(transport) = tls_transport {
            mqtt_options.set_transport(transport);
        }

        let (client, mut eventloop) = AsyncClient::new(mqtt_options, 10);
        self.client = Some(client);
        self.connection_info = Some((config.name.clone(), config.broker_url.clone()));

        let status = Arc::clone(&self.status);
        let messages = Arc::clone(&self.messages);
        let subscriptions = Arc::clone(&self.subscriptions);
        let resub_client = self.client.clone().unwrap();
        let events = self.events.clone();
        let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);
        self.shutdown_tx = Some(shutdown_tx);

        let task = tokio::spawn(async move {
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
                                info!("MQTT connected successfully");
                                *status.write().await = ConnectionStatus::Connected;
                                consecutive_errors = 0;
                                if let Some(ref events) = events {
                                    events.on_status("connected");
                                }
                                let subs = subscriptions.read().await.clone();
                                if !subs.is_empty() {
                                    let client = resub_client.clone();
                                    tokio::spawn(async move {
                                        for (topic, qos) in subs {
                                            if let Err(e) =
                                                client.subscribe(&topic, qos.into()).await
                                            {
                                                warn!(
                                                    "Failed to restore subscription '{}': {}",
                                                    topic, e
                                                );
                                            }
                                        }
                                    });
                                }
                            }
                            Ok(Event::Incoming(Packet::Publish(publish))) => {
                                consecutive_errors = 0;
                                let payload = String::from_utf8_lossy(&publish.payload).to_string();
                                debug!(
                                    "Received message on '{}': {} bytes",
                                    publish.topic,
                                    publish.payload.len()
                                );
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
                                if let Some(ref events) = events {
                                    events.on_message(&msg);
                                }
                            }
                            Ok(_) => {
                                consecutive_errors = 0;
                            }
                            Err(e) => {
                                consecutive_errors += 1;
                                warn!(
                                    "MQTT connection error ({}/{}): {}",
                                    consecutive_errors, MAX_CONSECUTIVE_ERRORS, e
                                );

                                *status.write().await = ConnectionStatus::Error;
                                if let Some(ref events) = events {
                                    events.on_status("error");
                                }

                                if consecutive_errors >= MAX_CONSECUTIVE_ERRORS {
                                    error!("MQTT: Too many consecutive errors, giving up");
                                    break;
                                }

                                tokio::time::sleep(Duration::from_millis(500)).await;
                            }
                        }
                    }
                }
            }
        });
        self.eventloop_task = Some(task);

        Ok(())
    }

    pub fn is_running(&self) -> bool {
        self.eventloop_task
            .as_ref()
            .is_some_and(|task| !task.is_finished())
    }

    pub async fn wait_connected(&self, timeout: Duration) -> Result<(), MqttError> {
        let deadline = tokio::time::Instant::now() + timeout;
        loop {
            if self.get_status().await == ConnectionStatus::Connected {
                return Ok(());
            }
            if !self.is_running() {
                return Err(MqttError::ConnectionFailed);
            }
            if tokio::time::Instant::now() >= deadline {
                return Err(MqttError::Timeout);
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    }

    pub async fn disconnect(&mut self) {
        if let Some((name, url)) = &self.connection_info {
            info!("Disconnecting from {} ({})", name, url);
        }

        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(()).await;
        }

        if let Some(client) = self.client.take() {
            let _ = client.disconnect().await;
        }

        self.eventloop_task = None;
        self.subscriptions.write().await.clear();
        self.connection_info = None;
        *self.status.write().await = ConnectionStatus::Disconnected;
        if let Some(ref events) = self.events {
            events.on_status("disconnected");
        }
        debug!("Disconnected successfully");
    }

    pub async fn subscribe(&self, topic: &str, qos: QoS) -> Result<(), MqttError> {
        debug!("Subscribing to '{}' with QoS {:?}", topic, qos);
        let client = self.client.as_ref().ok_or(MqttError::NotConnected)?;
        client.subscribe(topic, qos.into()).await?;
        let mut subs = self.subscriptions.write().await;
        if let Some(existing) = subs.iter_mut().find(|(t, _)| t == topic) {
            existing.1 = qos;
        } else {
            subs.push((topic.to_string(), qos));
        }
        info!("Subscribed to '{}'", topic);
        Ok(())
    }

    pub async fn unsubscribe(&self, topic: &str) -> Result<(), MqttError> {
        debug!("Unsubscribing from '{}'", topic);
        let client = self.client.as_ref().ok_or(MqttError::NotConnected)?;
        client.unsubscribe(topic).await?;
        self.subscriptions.write().await.retain(|(t, _)| t != topic);
        info!("Unsubscribed from '{}'", topic);
        Ok(())
    }

    pub async fn publish(
        &self,
        topic: &str,
        payload: &str,
        qos: QoS,
        retain: bool,
    ) -> Result<(), MqttError> {
        debug!(
            "Publishing to '{}': {} bytes (QoS {:?}, retain: {})",
            topic,
            payload.len(),
            qos,
            retain
        );
        let client = self.client.as_ref().ok_or(MqttError::NotConnected)?;
        client
            .publish(topic, qos.into(), retain, payload.as_bytes())
            .await?;
        if payload.is_empty() {
            info!("Published to '{}'", topic);
        } else {
            info!("Published '{}' to '{}'", payload.replace('\n', " "), topic);
        }
        Ok(())
    }

    pub async fn get_status(&self) -> ConnectionStatus {
        self.status.read().await.clone()
    }

    pub async fn get_messages(&self) -> Vec<Message> {
        self.messages.read().await.iter().cloned().collect()
    }

    pub async fn clear_messages(&self) {
        self.messages.write().await.clear();
    }
}

impl Default for MqttClient {
    fn default() -> Self {
        Self::new()
    }
}

fn read_tls_file(label: &str, path: &str) -> Result<Vec<u8>, MqttError> {
    std::fs::read(path).map_err(|e| MqttError::TlsSetup(format!("cannot read {label} {path}: {e}")))
}

fn build_tls_transport(config: &Connection) -> Result<Transport, MqttError> {
    let client_auth = match (&config.client_cert_path, &config.client_key_path) {
        (Some(cert), Some(key)) => Some((cert.as_str(), key.as_str())),
        (None, None) => None,
        _ => return Err(MqttError::IncompleteClientAuth),
    };

    if config.ca_cert_path.is_none() && client_auth.is_none() {
        return Ok(Transport::tls_with_default_config());
    }

    let mut roots = RootCertStore::empty();
    let native = rustls_native_certs::load_native_certs()
        .map_err(|e| MqttError::TlsSetup(format!("cannot load system trust store: {e}")))?;
    for cert in native {
        let _ = roots.add(cert);
    }

    if let Some(path) = &config.ca_cert_path {
        let pem = read_tls_file("CA certificate", path)?;
        let mut added = 0;
        for cert in rustls_pemfile::certs(&mut pem.as_slice()) {
            let cert = cert
                .map_err(|e| MqttError::TlsSetup(format!("invalid CA certificate {path}: {e}")))?;
            roots
                .add(cert)
                .map_err(|e| MqttError::TlsSetup(format!("invalid CA certificate {path}: {e}")))?;
            added += 1;
        }
        if added == 0 {
            return Err(MqttError::TlsSetup(format!(
                "no certificates found in {path}"
            )));
        }
    }

    let builder = ClientConfig::builder().with_root_certificates(roots);
    let mut tls = if let Some((cert_path, key_path)) = client_auth {
        let cert_pem = read_tls_file("client certificate", cert_path)?;
        let certs = rustls_pemfile::certs(&mut cert_pem.as_slice())
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| {
                MqttError::TlsSetup(format!("invalid client certificate {cert_path}: {e}"))
            })?;
        if certs.is_empty() {
            return Err(MqttError::TlsSetup(format!(
                "no certificates found in {cert_path}"
            )));
        }
        let key_pem = read_tls_file("client key", key_path)?;
        let key = rustls_pemfile::private_key(&mut key_pem.as_slice())
            .map_err(|e| MqttError::TlsSetup(format!("invalid client key {key_path}: {e}")))?
            .ok_or_else(|| MqttError::TlsSetup(format!("no private key found in {key_path}")))?;
        builder
            .with_client_auth_cert(certs, key)
            .map_err(|e| MqttError::TlsSetup(format!("client certificate rejected: {e}")))?
    } else {
        builder.with_no_client_auth()
    };

    if config.port == 443 && client_auth.is_some() {
        tls.alpn_protocols.push(b"x-amzn-mqtt-ca".to_vec());
    }

    Ok(Transport::Tls(TlsConfiguration::Rustls(Arc::new(tls))))
}

fn strip_protocol(url: &str) -> &str {
    let url = url.trim();
    for prefix in ["mqtt://", "mqtts://", "tcp://", "ssl://"] {
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
            ca_cert_path: None,
            client_cert_path: None,
            client_key_path: None,
            auto_connect: false,
            variables: std::collections::HashMap::new(),
            variable_history: std::collections::HashMap::new(),
            buttons: vec![],
            groups: vec![],
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
            client.disconnect().await;
            assert_eq!(client.get_status().await, ConnectionStatus::Disconnected);
        });
    }

    #[test]
    fn test_connect_rejects_websocket_url() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let mut client = MqttClient::new();
            for url in ["ws://broker.example.com", "wss://broker.example.com"] {
                let config = create_test_connection(url, 1883);
                let result = client.connect(&config).await;
                assert!(matches!(result, Err(MqttError::WebsocketUnsupported)));
                assert_eq!(client.get_status().await, ConnectionStatus::Disconnected);
            }
        });
    }

    #[test]
    fn test_wait_connected_without_connection_fails() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let client = MqttClient::new();
            let result = client.wait_connected(Duration::from_millis(100)).await;
            assert!(matches!(result, Err(MqttError::ConnectionFailed)));
        });
    }

    #[test]
    fn test_wait_connected_times_out_while_connecting() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let mut client = MqttClient::new();
            let config = create_test_connection("invalid.broker.local", 1883);
            let _ = client.connect(&config).await;
            let result = client.wait_connected(Duration::from_millis(200)).await;
            assert!(matches!(
                result,
                Err(MqttError::Timeout) | Err(MqttError::ConnectionFailed)
            ));
            client.disconnect().await;
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
            let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
            loop {
                if client.get_status().await == ConnectionStatus::Error {
                    break;
                }
                assert!(
                    tokio::time::Instant::now() < deadline,
                    "status never became Error"
                );
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
            client.disconnect().await;
        });
    }

    #[test]
    fn test_disconnect_resets_status() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let mut client = MqttClient::new();
            let config = create_test_connection("invalid.broker.local", 1883);
            let _ = client.connect(&config).await;
            client.disconnect().await;
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
            client.disconnect().await;
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
            "ws://broker.example.com"
        );
        assert_eq!(
            strip_protocol("wss://broker.example.com"),
            "wss://broker.example.com"
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

    const TEST_CERT_PEM: &str = "-----BEGIN CERTIFICATE-----
MIIBiDCCAS2gAwIBAgIUPuDLHpM5ysFQvw1Up+FTH6CKYjIwCgYIKoZIzj0EAwIw
GTEXMBUGA1UEAwwOdG9waWMtbGFiLXRlc3QwHhcNMjYwOTAzMTQwNzMwWhcNNDYw
ODI5MTQwNzMwWjAZMRcwFQYDVQQDDA50b3BpYy1sYWItdGVzdDBZMBMGByqGSM49
AgEGCCqGSM49AwEHA0IABOFQmZdS5a2pBYqhIoVlJhHxCp7l7xPutqkqg6ZCVNaR
hR/LYaQqFby5MW5a+PKsK/0f5EmuEMw8JzF7yc3+q/qjUzBRMB0GA1UdDgQWBBTX
+NlcqRnzWjp+KtaZI93Jv+8vajAfBgNVHSMEGDAWgBTX+NlcqRnzWjp+KtaZI93J
v+8vajAPBgNVHRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA0kAMEYCIQCv+knLtFNq
qkHXfBIT9Uyg5khBRRqRZkDcEQunM1tU0QIhALo4gk/wXrlUBxsczToXYBPHt01P
DLBS8IzKIa9miBb5
-----END CERTIFICATE-----
";

    const TEST_KEY_PEM: &str = "-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgymxwCg0uNxrH7pOi
VTqsHLmxLZRE29jLYmOk/aumynehRANCAAThUJmXUuWtqQWKoSKFZSYR8Qqe5e8T
7rapKoOmQlTWkYUfy2GkKhW8uTFuWvjyrCv9H+RJrhDMPCcxe8nN/qv6
-----END PRIVATE KEY-----
";

    fn tls_connection(
        port: u16,
        ca: Option<&std::path::Path>,
        cert: Option<&std::path::Path>,
        key: Option<&std::path::Path>,
    ) -> Connection {
        let mut conn = create_test_connection("broker.example.com", port);
        conn.use_tls = true;
        conn.ca_cert_path = ca.map(|p| p.to_string_lossy().into_owned());
        conn.client_cert_path = cert.map(|p| p.to_string_lossy().into_owned());
        conn.client_key_path = key.map(|p| p.to_string_lossy().into_owned());
        conn
    }

    fn write_fixture(dir: &tempfile::TempDir, name: &str, content: &str) -> std::path::PathBuf {
        let path = dir.path().join(name);
        std::fs::write(&path, content).unwrap();
        path
    }

    fn rustls_config(transport: Transport) -> Arc<ClientConfig> {
        match transport {
            Transport::Tls(TlsConfiguration::Rustls(config)) => config,
            _ => panic!("expected a rustls TLS transport"),
        }
    }

    #[test]
    fn test_build_tls_default_without_cert_paths() {
        let conn = tls_connection(8883, None, None, None);
        let transport = build_tls_transport(&conn).unwrap();
        assert!(matches!(transport, Transport::Tls(_)));
    }

    #[test]
    fn test_build_tls_rejects_cert_without_key() {
        let dir = tempfile::tempdir().unwrap();
        let cert = write_fixture(&dir, "cert.pem", TEST_CERT_PEM);
        let conn = tls_connection(8883, None, Some(&cert), None);
        assert!(matches!(
            build_tls_transport(&conn),
            Err(MqttError::IncompleteClientAuth)
        ));

        let key = write_fixture(&dir, "key.pem", TEST_KEY_PEM);
        let conn = tls_connection(8883, None, None, Some(&key));
        assert!(matches!(
            build_tls_transport(&conn),
            Err(MqttError::IncompleteClientAuth)
        ));
    }

    #[test]
    fn test_build_tls_with_client_cert() {
        let dir = tempfile::tempdir().unwrap();
        let cert = write_fixture(&dir, "cert.pem", TEST_CERT_PEM);
        let key = write_fixture(&dir, "key.pem", TEST_KEY_PEM);
        let conn = tls_connection(8883, None, Some(&cert), Some(&key));
        let config = rustls_config(build_tls_transport(&conn).unwrap());
        assert!(config.alpn_protocols.is_empty());
    }

    #[test]
    fn test_build_tls_alpn_on_port_443_with_client_cert() {
        let dir = tempfile::tempdir().unwrap();
        let cert = write_fixture(&dir, "cert.pem", TEST_CERT_PEM);
        let key = write_fixture(&dir, "key.pem", TEST_KEY_PEM);
        let conn = tls_connection(443, None, Some(&cert), Some(&key));
        let config = rustls_config(build_tls_transport(&conn).unwrap());
        assert_eq!(config.alpn_protocols, vec![b"x-amzn-mqtt-ca".to_vec()]);
    }

    #[test]
    fn test_build_tls_custom_ca_only_no_alpn() {
        let dir = tempfile::tempdir().unwrap();
        let ca = write_fixture(&dir, "ca.pem", TEST_CERT_PEM);
        let conn = tls_connection(443, Some(&ca), None, None);
        let config = rustls_config(build_tls_transport(&conn).unwrap());
        assert!(config.alpn_protocols.is_empty());
    }

    #[test]
    fn test_build_tls_missing_file_names_path() {
        let conn = tls_connection(
            8883,
            Some(std::path::Path::new("/nonexistent/ca.pem")),
            None,
            None,
        );
        match build_tls_transport(&conn) {
            Err(MqttError::TlsSetup(msg)) => assert!(msg.contains("/nonexistent/ca.pem")),
            other => panic!("expected TlsSetup error, got {:?}", other.map(|_| ())),
        }
    }

    #[test]
    fn test_build_tls_rejects_non_pem_ca() {
        let dir = tempfile::tempdir().unwrap();
        let ca = write_fixture(&dir, "ca.pem", "not a certificate");
        let conn = tls_connection(8883, Some(&ca), None, None);
        assert!(matches!(
            build_tls_transport(&conn),
            Err(MqttError::TlsSetup(_))
        ));
    }

    #[test]
    fn test_build_tls_rejects_key_without_private_key_block() {
        let dir = tempfile::tempdir().unwrap();
        let cert = write_fixture(&dir, "cert.pem", TEST_CERT_PEM);
        let key = write_fixture(&dir, "key.pem", TEST_CERT_PEM);
        let conn = tls_connection(8883, None, Some(&cert), Some(&key));
        assert!(matches!(
            build_tls_transport(&conn),
            Err(MqttError::TlsSetup(_))
        ));
    }
}
