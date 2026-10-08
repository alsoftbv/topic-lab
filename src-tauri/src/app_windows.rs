use crate::types::AppData;
use crate::window_registry::{Claim, WindowRegistry};
use crate::window_state::{self, InitialPlacement, WindowStateStore, MIN_HEIGHT, MIN_WIDTH};
use tauri::{
    AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

pub const APP_TITLE: &str = "MQTT Topic Lab";

pub fn build_window<R: Runtime, M: Manager<R>>(
    manager: &M,
    label: &str,
    placement: InitialPlacement,
    tab: bool,
) -> tauri::Result<WebviewWindow<R>> {
    let mut builder = WebviewWindowBuilder::new(manager, label, WebviewUrl::default())
        .title(APP_TITLE)
        .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
        .inner_size(placement.width, placement.height);
    builder = match placement.position {
        Some((x, y)) => builder.position(x, y),
        None => builder.center(),
    };
    if std::env::var("MQTT_TOPIC_LAB_DATA_DIR").is_ok() {
        builder = builder.initialization_script("window.__TAURI_E2E__ = true;");
    }
    #[cfg(target_os = "macos")]
    {
        builder = builder.tabbing_identifier("mqtt-topic-lab");
    }
    #[cfg(not(target_os = "linux"))]
    {
        builder = builder.visible(false);
    }
    let window = builder.build()?;
    show(&window, tab)?;
    Ok(window)
}

#[cfg(target_os = "macos")]
fn show<R: Runtime>(window: &WebviewWindow<R>, tab: bool) -> tauri::Result<()> {
    let shown = window.clone();
    window.run_on_main_thread(move || {
        if tab {
            crate::macos_tabs::prefer_tab(&shown);
        }
        let _ = shown.show();
    })
}

#[cfg(target_os = "windows")]
fn show<R: Runtime>(window: &WebviewWindow<R>, _tab: bool) -> tauri::Result<()> {
    window.show()
}

#[cfg(target_os = "linux")]
fn show<R: Runtime>(_window: &WebviewWindow<R>, _tab: bool) -> tauri::Result<()> {
    Ok(())
}

pub fn focused_window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    app.webview_windows()
        .into_values()
        .find(|w| w.is_focused().unwrap_or(false))
}

fn reference_window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    focused_window(app).or_else(|| app.webview_windows().into_values().next())
}

pub fn focus<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    window.unminimize()?;
    window.show()?;
    window.set_focus()
}

pub fn open_window<R: Runtime>(
    app: &AppHandle<R>,
    connection_id: Option<String>,
    tab: bool,
) -> tauri::Result<()> {
    let registry = app.state::<WindowRegistry>();
    let label = registry.next_label();
    registry.register(&label, None);
    if let Some(id) = connection_id {
        if let Ok(Claim::OpenElsewhere { label: owner }) = registry.claim(&label, &id) {
            registry.remove(&label);
            if let Some(window) = app.get_webview_window(&owner) {
                focus(&window)?;
            }
            return Ok(());
        }
    }

    let reference = reference_window(app);
    let monitors = reference
        .as_ref()
        .and_then(|w| w.available_monitors().ok())
        .unwrap_or_default();
    let placement = match reference
        .as_ref()
        .and_then(|w| window_state::capture(&w.as_ref().window()))
    {
        Some(current) if tab => window_state::same_placement(&monitors, current),
        Some(current) => window_state::cascade_placement(&monitors, current),
        None => window_state::initial_placement(&monitors, app.state::<WindowStateStore>().inner()),
    };
    match build_window(app, &label, placement, tab) {
        Ok(_) => {
            broadcast_open_connections(app);
            Ok(())
        }
        Err(e) => {
            registry.remove(&label);
            Err(e)
        }
    }
}

pub fn spawn_new_window<R: Runtime>(app: &AppHandle<R>, tab: bool) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = open_window(&app, None, tab) {
            log::error!("Failed to open a new window: {e}");
        }
    });
}

pub fn broadcast_open_connections<R: Runtime>(app: &AppHandle<R>) {
    let open = app.state::<WindowRegistry>().open_connections();
    let _ = app.emit("open-connections-changed", &open);
}

pub fn refresh_titles<R: Runtime>(app: &AppHandle<R>, data: &AppData) {
    let registry = app.state::<WindowRegistry>();
    for (label, window) in app.webview_windows() {
        let name = registry
            .connection_of(&label)
            .and_then(|id| data.connections.iter().find(|c| c.id == id))
            .map(|c| c.name.clone());
        let title = name.unwrap_or_else(|| APP_TITLE.to_string());
        if window.title().ok().as_deref() != Some(title.as_str()) {
            let _ = window.set_title(&title);
        }
    }
}
