use log::{debug, warn};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, PhysicalPosition, Runtime, Window};

pub const MIN_WIDTH: f64 = 550.0;
pub const MIN_HEIGHT: f64 = 450.0;
pub const DEFAULT_WIDTH: f64 = 1000.0;
pub const DEFAULT_HEIGHT: f64 = 700.0;

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize)]
pub struct WindowState {
    pub width: f64,
    pub height: f64,
    pub x: f64,
    pub y: f64,
}

#[derive(Default)]
struct StoreInner {
    cached: Option<WindowState>,
    frozen: bool,
}

pub struct WindowStateStore {
    path: PathBuf,
    inner: Mutex<StoreInner>,
}

impl WindowStateStore {
    pub fn new() -> Self {
        let app_dir = if let Ok(custom) = std::env::var("MQTT_TOPIC_LAB_DATA_DIR") {
            PathBuf::from(custom)
        } else {
            dirs::data_dir()
                .map(|d| d.join("mqtt-topic-lab"))
                .unwrap_or_else(|| PathBuf::from("."))
        };
        let _ = fs::create_dir_all(&app_dir);
        Self {
            path: app_dir.join("window-state.json"),
            inner: Mutex::new(StoreInner::default()),
        }
    }

    pub fn load(&self) -> Option<WindowState> {
        let content = fs::read_to_string(&self.path).ok()?;
        let state: WindowState = serde_json::from_str(&content).ok()?;
        Some(state)
    }

    pub fn update(&self, state: WindowState) {
        let mut inner = self.inner.lock().unwrap();
        if inner.frozen {
            return;
        }
        inner.cached = Some(state);
    }

    pub fn flush_and_freeze(&self) {
        let mut inner = self.inner.lock().unwrap();
        inner.frozen = true;
        if let Some(state) = inner.cached {
            self.write(state);
        }
    }

    pub fn flush(&self) {
        let state = {
            let inner = self.inner.lock().unwrap();
            inner.cached
        };
        if let Some(state) = state {
            self.write(state);
        }
    }

    fn write(&self, state: WindowState) {
        match serde_json::to_string_pretty(&state) {
            Ok(content) => {
                if let Err(e) = fs::write(&self.path, content) {
                    warn!("Failed to write window state: {}", e);
                }
            }
            Err(e) => warn!("Failed to serialize window state: {}", e),
        }
    }
}

pub struct InitialPlacement {
    pub width: f64,
    pub height: f64,
    pub position: Option<(f64, f64)>,
}

pub fn initial_placement<R: Runtime, M: Manager<R>>(
    app: &M,
    store: &WindowStateStore,
) -> InitialPlacement {
    let Some(state) = store.load() else {
        return InitialPlacement {
            width: DEFAULT_WIDTH,
            height: DEFAULT_HEIGHT,
            position: None,
        };
    };

    let (width, height) = clamp_size(state.width, state.height);
    let position = if position_visible(app, state.x, state.y, width, height) {
        Some((state.x, state.y))
    } else {
        debug!("Saved position not on any monitor; will center");
        None
    };

    InitialPlacement {
        width,
        height,
        position,
    }
}

fn clamp_size(width: f64, height: f64) -> (f64, f64) {
    (width.max(MIN_WIDTH), height.max(MIN_HEIGHT))
}

fn position_visible<R: Runtime, M: Manager<R>>(
    app: &M,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> bool {
    let handle = app.app_handle();
    let monitors = match handle.available_monitors() {
        Ok(m) => m,
        Err(_) => return false,
    };
    if monitors.is_empty() {
        return false;
    }
    let scale = handle
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| m.scale_factor())
        .unwrap_or(1.0);

    let phys_x = (x * scale) as i32;
    let phys_y = (y * scale) as i32;
    let phys_w = (width * scale) as i32;
    let phys_h = (height * scale) as i32;

    for monitor in &monitors {
        let pos: PhysicalPosition<i32> = *monitor.position();
        let size = monitor.size();
        let mx = pos.x;
        let my = pos.y;
        let mw = size.width as i32;
        let mh = size.height as i32;

        let overlap_x = phys_x.max(mx) < (phys_x + phys_w).min(mx + mw);
        let overlap_y = phys_y.max(my) < (phys_y + phys_h).min(my + mh);
        if overlap_x && overlap_y {
            return true;
        }
    }
    false
}

pub fn capture(window: &Window) -> Option<WindowState> {
    let scale = window.scale_factor().ok()?;
    let size = window.inner_size().ok()?;

    #[cfg(target_os = "macos")]
    let pos = window.inner_position().ok()?;
    #[cfg(not(target_os = "macos"))]
    let pos = window.outer_position().ok()?;

    Some(WindowState {
        width: size.width as f64 / scale,
        height: size.height as f64 / scale,
        x: pos.x as f64 / scale,
        y: pos.y as f64 / scale,
    })
}
