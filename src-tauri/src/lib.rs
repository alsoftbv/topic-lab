mod mqtt;
mod storage;
mod types;

use log::info;
use mqtt::{Message, MqttClient};
use std::io::Write;
use std::sync::Arc;
use storage::Storage;
use tauri::State;
use tokio::sync::RwLock;
use types::{AppData, Connection, QoS};

struct AppState {
    storage: Storage,
    mqtt_client: Arc<RwLock<MqttClient>>,
}

#[tauri::command]
async fn get_data(state: State<'_, AppState>) -> Result<AppData, String> {
    state.storage.load_data().map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_data(state: State<'_, AppState>, data: AppData) -> Result<(), String> {
    state.storage.save_data(&data).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_data(state: State<'_, AppState>) -> Result<(), String> {
    state.storage.delete_data().map_err(|e| e.to_string())
}

#[tauri::command]
async fn connect(state: State<'_, AppState>, connection: Connection) -> Result<(), String> {
    let mut client = state.mqtt_client.write().await;
    client.connect(&connection).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn disconnect(state: State<'_, AppState>) -> Result<(), String> {
    let mut client = state.mqtt_client.write().await;
    client.disconnect().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn publish(
    state: State<'_, AppState>,
    topic: String,
    payload: String,
    qos: QoS,
    retain: bool,
) -> Result<(), String> {
    let client = state.mqtt_client.read().await;
    client
        .publish(&topic, &payload, qos, retain)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn subscribe(state: State<'_, AppState>, topic: String, qos: QoS) -> Result<(), String> {
    let client = state.mqtt_client.read().await;
    client
        .subscribe(&topic, qos)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn unsubscribe(state: State<'_, AppState>, topic: String) -> Result<(), String> {
    let client = state.mqtt_client.read().await;
    client.unsubscribe(&topic).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_messages(state: State<'_, AppState>) -> Result<Vec<Message>, String> {
    let client = state.mqtt_client.read().await;
    Ok(client.get_messages().await)
}

#[tauri::command]
async fn clear_messages(state: State<'_, AppState>) -> Result<(), String> {
    let client = state.mqtt_client.read().await;
    client.clear_messages().await;
    Ok(())
}

#[tauri::command]
async fn get_subscriptions(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let client = state.mqtt_client.read().await;
    Ok(client.get_subscriptions().await)
}

pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format(|buf, record| {
            writeln!(
                buf,
                "[{}] [{}] {}",
                buf.timestamp(),
                record.level(),
                record.args()
            )
        })
        .init();
    info!("Starting MQTT Topic Lab");

    let storage = Storage::new().expect("Failed to initialize storage");
    let mqtt_client = Arc::new(RwLock::new(MqttClient::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .manage(AppState {
            storage,
            mqtt_client: Arc::clone(&mqtt_client),
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            let client = Arc::clone(&mqtt_client);
            tauri::async_runtime::block_on(async {
                client.write().await.set_app_handle(handle);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_data,
            save_data,
            delete_data,
            connect,
            disconnect,
            publish,
            subscribe,
            unsubscribe,
            get_messages,
            clear_messages,
            get_subscriptions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
