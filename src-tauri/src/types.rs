use serde::{Deserialize, Serialize};
use std::collections::HashMap;

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
#[allow(clippy::enum_variant_names)]
pub enum QoS {
    #[default]
    AtMostOnce = 0,
    AtLeastOnce = 1,
    ExactlyOnce = 2,
}

impl From<QoS> for rumqttc::QoS {
    fn from(qos: QoS) -> Self {
        match qos {
            QoS::AtMostOnce => rumqttc::QoS::AtMostOnce,
            QoS::AtLeastOnce => rumqttc::QoS::AtLeastOnce,
            QoS::ExactlyOnce => rumqttc::QoS::ExactlyOnce,
        }
    }
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ButtonColor {
    #[default]
    Orange,
    Green,
    Blue,
    Purple,
    Red,
    Teal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Button {
    pub id: String,
    pub name: String,
    pub topic: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload: Option<String>,
    #[serde(default)]
    pub qos: QoS,
    #[serde(default)]
    pub retain: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<ButtonColor>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub multi_send_enabled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub multi_send_interval: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ButtonGroup {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connection {
    pub id: String,
    pub name: String,
    pub broker_url: String,
    pub port: u16,
    pub client_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(default)]
    pub use_tls: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ca_cert_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_cert_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_key_path: Option<String>,
    #[serde(default = "default_true")]
    pub auto_connect: bool,
    #[serde(default)]
    pub variables: HashMap<String, String>,
    #[serde(default)]
    pub variable_history: HashMap<String, Vec<String>>,
    #[serde(default)]
    pub buttons: Vec<Button>,
    #[serde(default)]
    pub groups: Vec<ButtonGroup>,
    #[serde(default)]
    pub subscriptions: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_check_updates: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AppData {
    #[serde(default)]
    pub connections: Vec<Connection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_connection_id: Option<String>,
    #[serde(default)]
    pub settings: AppSettings,
}

impl AppData {
    pub fn new(connections: Vec<Connection>, last_connection_id: Option<String>) -> Self {
        Self {
            connections,
            last_connection_id,
            ..Default::default()
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionStatus {
    #[default]
    Disconnected,
    Connecting,
    Connected,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegacyMqttConnection {
    pub broker_url: String,
    pub port: u16,
    pub client_id: String,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub use_tls: bool,
    #[serde(default = "default_true")]
    pub auto_connect: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegacyProject {
    pub name: String,
    pub connection: LegacyMqttConnection,
    #[serde(default)]
    pub variables: HashMap<String, String>,
    #[serde(default)]
    pub buttons: Vec<Button>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_button_color_serialization() {
        assert_eq!(
            serde_json::to_string(&ButtonColor::Orange).unwrap(),
            "\"orange\""
        );
        assert_eq!(
            serde_json::to_string(&ButtonColor::Green).unwrap(),
            "\"green\""
        );
        assert_eq!(
            serde_json::to_string(&ButtonColor::Blue).unwrap(),
            "\"blue\""
        );
        assert_eq!(
            serde_json::to_string(&ButtonColor::Purple).unwrap(),
            "\"purple\""
        );
        assert_eq!(serde_json::to_string(&ButtonColor::Red).unwrap(), "\"red\"");
        assert_eq!(
            serde_json::to_string(&ButtonColor::Teal).unwrap(),
            "\"teal\""
        );
    }

    #[test]
    fn test_button_color_deserialization() {
        assert_eq!(
            serde_json::from_str::<ButtonColor>("\"orange\"").unwrap(),
            ButtonColor::Orange
        );
        assert_eq!(
            serde_json::from_str::<ButtonColor>("\"green\"").unwrap(),
            ButtonColor::Green
        );
        assert_eq!(
            serde_json::from_str::<ButtonColor>("\"blue\"").unwrap(),
            ButtonColor::Blue
        );
        assert_eq!(
            serde_json::from_str::<ButtonColor>("\"purple\"").unwrap(),
            ButtonColor::Purple
        );
        assert_eq!(
            serde_json::from_str::<ButtonColor>("\"red\"").unwrap(),
            ButtonColor::Red
        );
        assert_eq!(
            serde_json::from_str::<ButtonColor>("\"teal\"").unwrap(),
            ButtonColor::Teal
        );
    }

    #[test]
    fn test_button_color_default() {
        assert_eq!(ButtonColor::default(), ButtonColor::Orange);
    }

    #[test]
    fn test_button_with_color() {
        let button_json = r#"{
            "id": "btn1",
            "name": "Test Button",
            "topic": "test/topic",
            "color": "blue"
        }"#;
        let button: Button = serde_json::from_str(button_json).unwrap();
        assert_eq!(button.color, Some(ButtonColor::Blue));
    }

    #[test]
    fn test_button_without_color_defaults_to_none() {
        let button_json = r#"{
            "id": "btn1",
            "name": "Test Button",
            "topic": "test/topic"
        }"#;
        let button: Button = serde_json::from_str(button_json).unwrap();
        assert_eq!(button.color, None);
    }

    #[test]
    fn test_button_serialization_with_color() {
        let button = Button {
            id: "btn1".to_string(),
            name: "Test".to_string(),
            topic: "test/topic".to_string(),
            payload: None,
            qos: QoS::AtMostOnce,
            retain: false,
            color: Some(ButtonColor::Purple),
            multi_send_enabled: None,
            multi_send_interval: None,
            group_id: None,
        };
        let json = serde_json::to_string(&button).unwrap();
        assert!(json.contains("\"color\":\"purple\""));
    }

    #[test]
    fn test_connection_with_subscriptions() {
        let conn_json = r#"{
            "id": "conn1",
            "name": "Test Connection",
            "broker_url": "localhost",
            "port": 1883,
            "client_id": "test-client",
            "use_tls": false,
            "auto_connect": true,
            "variables": {},
            "buttons": [],
            "subscriptions": ["topic/a", "topic/b/#", "sensor/+/data"]
        }"#;
        let conn: Connection = serde_json::from_str(conn_json).unwrap();
        assert_eq!(conn.subscriptions.len(), 3);
        assert_eq!(conn.subscriptions[0], "topic/a");
        assert_eq!(conn.subscriptions[1], "topic/b/#");
        assert_eq!(conn.subscriptions[2], "sensor/+/data");
    }

    #[test]
    fn test_connection_without_subscriptions_defaults_to_empty() {
        let conn_json = r#"{
            "id": "conn1",
            "name": "Test Connection",
            "broker_url": "localhost",
            "port": 1883,
            "client_id": "test-client"
        }"#;
        let conn: Connection = serde_json::from_str(conn_json).unwrap();
        assert!(conn.subscriptions.is_empty());
    }

    #[test]
    fn test_connection_subscriptions_with_variables() {
        let conn_json = r#"{
            "id": "conn1",
            "name": "Test Connection",
            "broker_url": "localhost",
            "port": 1883,
            "client_id": "test-client",
            "subscriptions": ["devices/{device_id}/+", "s/{mac}/#"]
        }"#;
        let conn: Connection = serde_json::from_str(conn_json).unwrap();
        assert_eq!(conn.subscriptions.len(), 2);
        assert!(conn.subscriptions[0].contains("{device_id}"));
        assert!(conn.subscriptions[1].contains("{mac}"));
    }

    #[test]
    fn test_qos_serialization() {
        assert_eq!(
            serde_json::to_string(&QoS::AtMostOnce).unwrap(),
            "\"atmostonce\""
        );
        assert_eq!(
            serde_json::to_string(&QoS::AtLeastOnce).unwrap(),
            "\"atleastonce\""
        );
        assert_eq!(
            serde_json::to_string(&QoS::ExactlyOnce).unwrap(),
            "\"exactlyonce\""
        );
    }

    #[test]
    fn test_qos_deserialization() {
        assert_eq!(
            serde_json::from_str::<QoS>("\"atmostonce\"").unwrap(),
            QoS::AtMostOnce
        );
        assert_eq!(
            serde_json::from_str::<QoS>("\"atleastonce\"").unwrap(),
            QoS::AtLeastOnce
        );
        assert_eq!(
            serde_json::from_str::<QoS>("\"exactlyonce\"").unwrap(),
            QoS::ExactlyOnce
        );
    }

    #[test]
    fn test_qos_default() {
        assert_eq!(QoS::default(), QoS::AtMostOnce);
    }

    #[test]
    fn test_connection_status_serialization() {
        assert_eq!(
            serde_json::to_string(&ConnectionStatus::Disconnected).unwrap(),
            "\"disconnected\""
        );
        assert_eq!(
            serde_json::to_string(&ConnectionStatus::Connecting).unwrap(),
            "\"connecting\""
        );
        assert_eq!(
            serde_json::to_string(&ConnectionStatus::Connected).unwrap(),
            "\"connected\""
        );
        assert_eq!(
            serde_json::to_string(&ConnectionStatus::Error).unwrap(),
            "\"error\""
        );
    }

    #[test]
    fn test_app_data_with_subscriptions() {
        let data_json = r#"{
            "connections": [{
                "id": "conn1",
                "name": "Test",
                "broker_url": "localhost",
                "port": 1883,
                "client_id": "test",
                "subscriptions": ["test/#"]
            }],
            "last_connection_id": "conn1"
        }"#;
        let data: AppData = serde_json::from_str(data_json).unwrap();
        assert_eq!(data.connections.len(), 1);
        assert_eq!(data.connections[0].subscriptions, vec!["test/#"]);
    }

    #[test]
    fn test_button_with_group_id() {
        let json = r#"{
            "id": "btn1",
            "name": "Test",
            "topic": "test/topic",
            "groupId": "group-1"
        }"#;
        let button: Button = serde_json::from_str(json).unwrap();
        assert_eq!(button.group_id, Some("group-1".to_string()));
    }

    #[test]
    fn test_button_without_group_id() {
        let json = r#"{
            "id": "btn1",
            "name": "Test",
            "topic": "test/topic"
        }"#;
        let button: Button = serde_json::from_str(json).unwrap();
        assert_eq!(button.group_id, None);
    }

    #[test]
    fn test_button_group_serialization() {
        let group = ButtonGroup {
            id: "g1".to_string(),
            name: "Living Room".to_string(),
        };
        let json = serde_json::to_string(&group).unwrap();
        assert!(json.contains("\"id\":\"g1\""));
        assert!(json.contains("\"name\":\"Living Room\""));
    }

    #[test]
    fn test_connection_with_groups() {
        let json = r#"{
            "id": "conn1",
            "name": "Test",
            "broker_url": "localhost",
            "port": 1883,
            "client_id": "test",
            "groups": [
                {"id": "g1", "name": "Group 1"},
                {"id": "g2", "name": "Group 2"}
            ]
        }"#;
        let conn: Connection = serde_json::from_str(json).unwrap();
        assert_eq!(conn.groups.len(), 2);
        assert_eq!(conn.groups[0].name, "Group 1");
    }

    #[test]
    fn test_connection_without_groups_defaults_to_empty() {
        let json = r#"{
            "id": "conn1",
            "name": "Test",
            "broker_url": "localhost",
            "port": 1883,
            "client_id": "test"
        }"#;
        let conn: Connection = serde_json::from_str(json).unwrap();
        assert!(conn.groups.is_empty());
    }

    #[test]
    fn test_connection_without_variable_history_defaults_to_empty() {
        let json = r#"{
            "id": "conn1",
            "name": "Test",
            "broker_url": "localhost",
            "port": 1883,
            "client_id": "test",
            "variables": {"mac": "AA:BB:CC"}
        }"#;
        let conn: Connection = serde_json::from_str(json).unwrap();
        assert!(conn.variable_history.is_empty());
    }

    #[test]
    fn test_connection_with_variable_history() {
        let json = r#"{
            "id": "conn1",
            "name": "Test",
            "broker_url": "localhost",
            "port": 1883,
            "client_id": "test",
            "variables": {"mac": "AA:BB:CC"},
            "variable_history": {"mac": ["11:22:33", "44:55:66"]}
        }"#;
        let conn: Connection = serde_json::from_str(json).unwrap();
        assert_eq!(conn.variable_history.len(), 1);
        assert_eq!(conn.variable_history["mac"], vec!["11:22:33", "44:55:66"]);
    }
}
