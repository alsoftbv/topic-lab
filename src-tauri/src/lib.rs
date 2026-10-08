mod app_windows;
mod cli;
mod data_store;
mod install;
#[cfg(target_os = "macos")]
mod macos_tabs;
mod mqtt;
mod mqtt_clients;
mod release_notes;
mod storage;
mod types;
mod variables;
mod window_registry;
mod window_state;

use data_store::{DataSnapshot, DataStore, StoreError};
use log::info;
use mqtt::{Message, MqttEvents};
use mqtt_clients::{MqttClients, SharedClient};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::io::Write;
use std::sync::Arc;
use storage::Storage;
use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{
    AppHandle, Emitter, EventTarget, Manager, RunEvent, State, WebviewWindow, WindowEvent,
};
use types::{Button, Connection, QoS};
use window_registry::{Claim, OpenConnection, WindowRegistry, MAIN_WINDOW};
use window_state::WindowStateStore;

struct AppState {
    store: DataStore,
    clients: MqttClients,
}

struct GuiLock {
    _file: Option<std::fs::File>,
}

struct TauriEvents {
    app: AppHandle,
    label: String,
}

impl MqttEvents for TauriEvents {
    fn on_status(&self, status: &str) {
        let _ = self.app.emit_to(
            EventTarget::webview_window(&self.label),
            "mqtt-status",
            status,
        );
    }

    fn on_message(&self, message: &Message) {
        let _ = self.app.emit_to(
            EventTarget::webview_window(&self.label),
            "mqtt-message",
            message.clone(),
        );
    }
}

async fn window_client(state: &AppState, window: &WebviewWindow) -> Result<SharedClient, String> {
    let registry = window.state::<WindowRegistry>();
    let app = window.app_handle().clone();
    let label = window.label().to_string();
    state
        .clients
        .get_or_create(
            window.label(),
            || registry.contains(window.label()),
            move || Arc::new(TauriEvents { app, label }),
        )
        .await
        .ok_or_else(|| "This window is closing".to_string())
}

fn broadcast(
    app: &AppHandle,
    result: Result<DataSnapshot, StoreError>,
) -> Result<DataSnapshot, String> {
    let snapshot = result.map_err(|e| e.to_string())?;
    app_windows::refresh_titles(app, &snapshot.data);
    let _ = app.emit("data-changed", &snapshot);
    Ok(snapshot)
}

#[tauri::command]
async fn get_data(state: State<'_, AppState>) -> Result<DataSnapshot, String> {
    state.store.snapshot().map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_connection(
    app: AppHandle,
    state: State<'_, AppState>,
    connection: Connection,
) -> Result<DataSnapshot, String> {
    broadcast(&app, state.store.save_connection(connection))
}

#[tauri::command]
async fn delete_connection(
    app: AppHandle,
    state: State<'_, AppState>,
    registry: State<'_, WindowRegistry>,
    id: String,
) -> Result<DataSnapshot, String> {
    let result = state.store.delete_connection(&id);
    if result.is_ok() && !registry.release_connection(&id).is_empty() {
        app_windows::broadcast_open_connections(&app);
    }
    broadcast(&app, result)
}

#[tauri::command]
async fn reorder_connections(
    app: AppHandle,
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> Result<DataSnapshot, String> {
    broadcast(&app, state.store.reorder_connections(&ids))
}

#[tauri::command]
async fn set_last_connection(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<DataSnapshot, String> {
    broadcast(&app, state.store.set_last_connection(&id))
}

#[tauri::command]
async fn update_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: Map<String, Value>,
) -> Result<DataSnapshot, String> {
    broadcast(&app, state.store.update_settings(settings))
}

#[tauri::command]
async fn delete_data(app: AppHandle, state: State<'_, AppState>) -> Result<DataSnapshot, String> {
    broadcast(&app, state.store.reset())
}

#[tauri::command]
async fn get_window_connection(
    window: WebviewWindow,
    registry: State<'_, WindowRegistry>,
) -> Result<Option<String>, String> {
    Ok(registry.connection_of(window.label()))
}

#[tauri::command]
async fn claim_connection(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppState>,
    registry: State<'_, WindowRegistry>,
    id: String,
) -> Result<Claim, String> {
    let snapshot = state.store.snapshot().map_err(|e| e.to_string())?;
    if !snapshot.data.connections.iter().any(|c| c.id == id) {
        return Err(format!("Connection not found: {id}"));
    }
    let claim = registry
        .claim(window.label(), &id)
        .map_err(|_| "This window is closing".to_string())?;
    if claim == Claim::Claimed {
        app_windows::refresh_titles(&app, &snapshot.data);
        app_windows::broadcast_open_connections(&app);
    }
    Ok(claim)
}

#[tauri::command]
async fn open_connections(
    registry: State<'_, WindowRegistry>,
) -> Result<Vec<OpenConnection>, String> {
    Ok(registry.open_connections())
}

#[tauri::command]
async fn focus_window(app: AppHandle, label: String) -> Result<(), String> {
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("Window not found: {label}"))?;
    app_windows::focus(&window).map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_window(
    app: AppHandle,
    state: State<'_, AppState>,
    connection_id: Option<String>,
) -> Result<(), String> {
    app_windows::open_window(&app, connection_id, false).map_err(|e| e.to_string())?;
    if let Ok(snapshot) = state.store.snapshot() {
        app_windows::refresh_titles(&app, &snapshot.data);
    }
    Ok(())
}

#[tauri::command]
async fn connect(
    window: WebviewWindow,
    state: State<'_, AppState>,
    connection: Connection,
) -> Result<(), String> {
    let client = window_client(&state, &window).await?;
    let mut client = client.write().await;
    client.connect(&connection).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn disconnect(window: WebviewWindow, state: State<'_, AppState>) -> Result<(), String> {
    let client = window_client(&state, &window).await?;
    client.write().await.disconnect().await;
    Ok(())
}

#[tauri::command]
async fn publish_button(
    window: WebviewWindow,
    state: State<'_, AppState>,
    button: Button,
    variables: HashMap<String, String>,
) -> Result<(), String> {
    let (topic, payload) = variables::resolve_button(&button, &variables);
    let client = window_client(&state, &window).await?;
    let client = client.read().await;
    client
        .publish(&topic, &payload, button.qos, button.retain)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn publish(
    window: WebviewWindow,
    state: State<'_, AppState>,
    topic: String,
    payload: String,
    qos: QoS,
    retain: bool,
    variables: HashMap<String, String>,
) -> Result<(), String> {
    let topic = variables::substitute_variables(&topic, &variables);
    let payload = variables::substitute_variables(&payload, &variables);
    let client = window_client(&state, &window).await?;
    let client = client.read().await;
    client
        .publish(&topic, &payload, qos, retain)
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
fn get_release_notes() -> Option<release_notes::ReleaseNotes> {
    release_notes::current()
}

#[tauri::command]
fn install_cli() -> Result<install::InstallReport, String> {
    install::install_for_gui()
}

#[tauri::command]
async fn subscribe(
    window: WebviewWindow,
    state: State<'_, AppState>,
    topic: String,
    qos: QoS,
) -> Result<(), String> {
    let client = window_client(&state, &window).await?;
    let client = client.read().await;
    client
        .subscribe(&topic, qos)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn unsubscribe(
    window: WebviewWindow,
    state: State<'_, AppState>,
    topic: String,
) -> Result<(), String> {
    let client = window_client(&state, &window).await?;
    let client = client.read().await;
    client.unsubscribe(&topic).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_messages(
    window: WebviewWindow,
    state: State<'_, AppState>,
) -> Result<Vec<Message>, String> {
    let client = window_client(&state, &window).await?;
    let client = client.read().await;
    Ok(client.get_messages().await)
}

#[tauri::command]
async fn clear_messages(window: WebviewWindow, state: State<'_, AppState>) -> Result<(), String> {
    let client = window_client(&state, &window).await?;
    client.read().await.clear_messages().await;
    Ok(())
}

fn build_menu(app: &mut tauri::App) -> tauri::Result<()> {
    let preferences = MenuItemBuilder::with_id("preferences", "Preferences…")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let new_window = MenuItemBuilder::with_id("new_window", "New Window")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;

    let about_metadata = AboutMetadata {
        name: Some("MQTT Topic Lab".into()),
        version: Some(env!("CARGO_PKG_VERSION").into()),
        ..Default::default()
    };

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
        let new_tab = MenuItemBuilder::with_id("new_tab", "New Tab")
            .accelerator("CmdOrCtrl+T")
            .build(app)?;
        let file_menu = SubmenuBuilder::new(app, "File")
            .item(&new_window)
            .item(&new_tab)
            .separator()
            .close_window()
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
        let view_menu = SubmenuBuilder::new(app, "View").fullscreen().build()?;
        let tab_item = |id: &str, text: &str, accelerator: Option<&str>| {
            let builder = MenuItemBuilder::with_id(id, text);
            match accelerator {
                Some(accelerator) => builder.accelerator(accelerator),
                None => builder,
            }
            .build(app)
        };
        let window_menu = SubmenuBuilder::new(app, "Window")
            .minimize()
            .maximize()
            .separator()
            .item(&tab_item(
                macos_tabs::SHOW_PREVIOUS_TAB,
                "Show Previous Tab",
                Some("Cmd+Shift+BracketLeft"),
            )?)
            .item(&tab_item(
                macos_tabs::SHOW_NEXT_TAB,
                "Show Next Tab",
                Some("Cmd+Shift+BracketRight"),
            )?)
            .item(&tab_item(
                macos_tabs::MOVE_TAB_TO_NEW_WINDOW,
                "Move Tab to New Window",
                None,
            )?)
            .item(&tab_item(
                macos_tabs::MERGE_ALL_WINDOWS,
                "Merge All Windows",
                None,
            )?)
            .separator()
            .bring_all_to_front()
            .build()?;
        let menu = MenuBuilder::new(app)
            .items(&[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu])
            .build()?;
        app.set_menu(menu)?;
        window_menu.set_as_windows_menu_for_nsapp()?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        let close_window = MenuItemBuilder::with_id("close_window", "Close Window")
            .accelerator("CmdOrCtrl+W")
            .build(app)?;
        let file_menu = SubmenuBuilder::new(app, "File")
            .item(&new_window)
            .item(&close_window)
            .separator()
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
        let menu = MenuBuilder::new(app)
            .items(&[&file_menu, &edit_menu, &help_menu])
            .build()?;
        app.set_menu(menu)?;
    }

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

#[cfg(target_os = "linux")]
fn enable_multithreaded_xlib() {
    if let Ok(xlib) = x11_dl::xlib::Xlib::open() {
        unsafe { (xlib.XInitThreads)() };
    }
}

pub fn run() {
    if cli::is_cli_invocation() {
        cli::run_cli();
        return;
    }

    #[cfg(target_os = "linux")]
    enable_multithreaded_xlib();

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

    let store = DataStore::new(Storage::new().expect("Failed to initialize storage"));

    let mut builder = tauri::Builder::default();
    if !cfg!(debug_assertions) && std::env::var_os("MQTT_TOPIC_LAB_DATA_DIR").is_none() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            app_windows::spawn_new_window(app, false);
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState {
            store,
            clients: MqttClients::new(),
        })
        .manage(WindowStateStore::new())
        .manage(WindowRegistry::new())
        .on_menu_event(|app, event| match event.id().as_ref() {
            "preferences" => {
                if let Some(window) = app_windows::focused_window(app) {
                    let _ = app.emit_to(
                        EventTarget::webview_window(window.label()),
                        "open-preferences",
                        (),
                    );
                }
            }
            "new_window" => app_windows::spawn_new_window(app, false),
            #[cfg(target_os = "macos")]
            "new_tab" => app_windows::spawn_new_window(app, true),
            "close_window" => {
                if let Some(window) = app_windows::focused_window(app) {
                    let _ = window.close();
                }
            }
            #[cfg(target_os = "macos")]
            id if macos_tabs::is_tab_action(id) => {
                if let Some(window) = app_windows::focused_window(app) {
                    macos_tabs::perform(&window, id);
                }
            }
            _ => {}
        })
        .setup(move |app| {
            app.manage(GuiLock {
                _file: acquire_gui_lock(app.state::<AppState>().store.storage()),
            });
            build_menu(app)?;

            let data = app
                .state::<AppState>()
                .store
                .snapshot()
                .ok()
                .map(|s| s.data);
            app.state::<WindowRegistry>().register(
                MAIN_WINDOW,
                data.as_ref().and_then(|d| d.initial_connection_id()),
            );
            let monitors = app.available_monitors().unwrap_or_default();
            let placement =
                window_state::initial_placement(&monitors, app.state::<WindowStateStore>().inner());
            app_windows::build_window(app, MAIN_WINDOW, placement, false)?;
            if let Some(data) = data {
                app_windows::refresh_titles(app.handle(), &data);
            }
            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::Focused(true) => {
                let app = window.app_handle().clone();
                let label = window.label().to_string();
                tauri::async_runtime::spawn(async move {
                    let Some(id) = app.state::<WindowRegistry>().connection_of(&label) else {
                        return;
                    };
                    if let Ok(Some(snapshot)) =
                        app.state::<AppState>().store.remember_last_connection(&id)
                    {
                        let _ = app.emit("data-changed", &snapshot);
                    }
                });
            }
            WindowEvent::Resized(_) | WindowEvent::Moved(_) => {
                if let Some(state) = window_state::capture(window) {
                    window
                        .state::<WindowStateStore>()
                        .update(window.label(), state);
                }
            }
            WindowEvent::CloseRequested { .. } => {
                window
                    .state::<WindowStateStore>()
                    .window_closing(window.label());
            }
            WindowEvent::Destroyed => {
                let app = window.app_handle().clone();
                let label = window.label().to_string();
                app.state::<WindowStateStore>().window_destroyed(&label);
                app.state::<WindowRegistry>().remove(&label);
                app_windows::broadcast_open_connections(&app);
                tauri::async_runtime::spawn(async move {
                    app.state::<AppState>().clients.close(&label).await;
                });
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            get_data,
            save_connection,
            delete_connection,
            reorder_connections,
            set_last_connection,
            update_settings,
            delete_data,
            get_window_connection,
            claim_connection,
            open_connections,
            focus_window,
            open_window,
            connect,
            disconnect,
            publish_button,
            publish,
            resolve_template,
            resolve_templates,
            get_builtin_names,
            get_release_notes,
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
