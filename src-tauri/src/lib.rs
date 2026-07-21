mod cli;
mod install;
mod mqtt;
mod storage;
mod types;
mod variables;
mod window_state;

use log::info;
use mqtt::{Message, MqttClient, MqttEvents};
use std::collections::HashMap;
use std::io::Write;
use std::sync::Arc;
use storage::Storage;
use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{
    AppHandle, Emitter, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tokio::sync::RwLock;
use types::{AppData, Button, Connection, QoS};
use window_state::{WindowStateStore, MIN_HEIGHT, MIN_WIDTH};

struct AppState {
    storage: Storage,
    mqtt_client: Arc<RwLock<MqttClient>>,
    _gui_lock: Option<std::fs::File>,
}

struct TauriEvents {
    app: AppHandle,
}

impl MqttEvents for TauriEvents {
    fn on_status(&self, status: &str) {
        let _ = self.app.emit("mqtt-status", status);
    }

    fn on_message(&self, message: &Message) {
        let _ = self.app.emit("mqtt-message", message.clone());
    }
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
    client.disconnect().await;
    Ok(())
}

#[tauri::command]
async fn publish_button(
    state: State<'_, AppState>,
    button: Button,
    variables: HashMap<String, String>,
) -> Result<(), String> {
    let (topic, payload) = variables::resolve_button(&button, &variables);
    let client = state.mqtt_client.read().await;
    client
        .publish(&topic, &payload, button.qos, button.retain)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn resolve_template(template: String, variables: HashMap<String, String>) -> String {
    variables::substitute_variables(&template, &variables)
}

#[tauri::command]
fn resolve_templates(templates: Vec<String>, variables: HashMap<String, String>) -> Vec<String> {
    templates
        .iter()
        .map(|t| variables::substitute_variables(t, &variables))
        .collect()
}

#[tauri::command]
fn get_builtin_names() -> Vec<String> {
    variables::builtin_names()
}

#[tauri::command]
fn install_cli() -> Result<install::InstallReport, String> {
    install::install_for_gui()
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

fn build_menu(app: &mut tauri::App) -> tauri::Result<()> {
    let preferences = MenuItemBuilder::with_id("preferences", "Preferences…")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;

    let about_metadata = AboutMetadata {
        name: Some("MQTT Topic Lab".into()),
        version: Some(env!("CARGO_PKG_VERSION").into()),
        ..Default::default()
    };

    let mut menu = MenuBuilder::new(app);

    #[cfg(target_os = "macos")]
    {
        let app_menu = SubmenuBuilder::new(app, "MQTT Topic Lab")
            .about(Some(about_metadata))
            .separator()
            .item(&preferences)
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .quit()
            .build()?;
        let edit_menu = SubmenuBuilder::new(app, "Edit")
            .undo()
            .redo()
            .separator()
            .cut()
            .copy()
            .paste()
            .select_all()
            .build()?;
        let window_menu = SubmenuBuilder::new(app, "Window")
            .minimize()
            .separator()
            .close_window()
            .build()?;
        menu = menu.items(&[&app_menu, &edit_menu, &window_menu]);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let file_menu = SubmenuBuilder::new(app, "File")
            .item(&preferences)
            .separator()
            .quit()
            .build()?;
        let edit_menu = SubmenuBuilder::new(app, "Edit")
            .undo()
            .redo()
            .separator()
            .cut()
            .copy()
            .paste()
            .select_all()
            .build()?;
        let help_menu = SubmenuBuilder::new(app, "Help")
            .about(Some(about_metadata))
            .build()?;
        menu = menu.items(&[&file_menu, &edit_menu, &help_menu]);
    }

    let menu = menu.build()?;
    app.set_menu(menu)?;
    Ok(())
}

fn acquire_gui_lock(storage: &Storage) -> Option<std::fs::File> {
    for _ in 0..10 {
        match storage.acquire_write_lock() {
            Ok(Some(file)) => return Some(file),
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(50)),
            Err(e) => {
                log::warn!("Could not acquire instance lock: {e}");
                return None;
            }
        }
    }
    log::warn!("Instance lock held by another process; running without config-write coordination");
    None
}

pub fn run() {
    if cli::is_cli_invocation() {
        cli::run_cli();
        return;
    }

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
    let gui_lock = acquire_gui_lock(&storage);
    let mqtt_client = Arc::new(RwLock::new(MqttClient::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState {
            storage,
            mqtt_client: Arc::clone(&mqtt_client),
            _gui_lock: gui_lock,
        })
        .manage(WindowStateStore::new())
        .on_menu_event(|app, event| {
            if event.id() == "preferences" {
                let _ = app.emit("open-preferences", ());
            }
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            let client = Arc::clone(&mqtt_client);
            tauri::async_runtime::block_on(async {
                client
                    .write()
                    .await
                    .set_events(Arc::new(TauriEvents { app: handle }));
            });

            build_menu(app)?;

            let store = app.state::<WindowStateStore>();
            let placement = window_state::initial_placement(app, store.inner());

            let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("MQTT Topic Lab")
                .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
                .inner_size(placement.width, placement.height);
            if let Some((x, y)) = placement.position {
                builder = builder.position(x, y);
            } else {
                builder = builder.center();
            }
            #[cfg(not(target_os = "linux"))]
            {
                builder = builder.visible(false);
            }
            let webview = builder.build()?;
            #[cfg(not(target_os = "linux"))]
            webview.show()?;

            if std::env::var("MQTT_TOPIC_LAB_DATA_DIR").is_ok() {
                let _ = webview.eval("window.__TAURI_E2E__ = true;");
            }
            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::Resized(_) | WindowEvent::Moved(_) => {
                if let Some(state) = window_state::capture(window) {
                    window.state::<WindowStateStore>().update(state);
                }
            }
            WindowEvent::CloseRequested { .. } => {
                window.state::<WindowStateStore>().flush_and_freeze();
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            get_data,
            save_data,
            delete_data,
            connect,
            disconnect,
            publish_button,
            resolve_template,
            resolve_templates,
            get_builtin_names,
            install_cli,
            subscribe,
            unsubscribe,
            get_messages,
            clear_messages,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<WindowStateStore>().flush();
            }
        });
}
