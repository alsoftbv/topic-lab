use log::{debug, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Monitor, PhysicalPosition, Runtime, Window};

pub const MIN_WIDTH: f64 = 720.0;
pub const MIN_HEIGHT: f64 = 450.0;
pub const DEFAULT_WIDTH: f64 = 1000.0;
pub const DEFAULT_HEIGHT: f64 = 700.0;
pub const CASCADE_OFFSET: f64 = 28.0;

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
    closing: HashSet<String>,
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

    pub fn update(&self, label: &str, state: WindowState) {
        let mut inner = self.inner.lock().unwrap();
        if inner.closing.contains(label) {
            return;
        }
        inner.cached = Some(state);
    }

    pub fn window_closing(&self, label: &str) {
        let mut inner = self.inner.lock().unwrap();
        inner.closing.insert(label.to_string());
        if let Some(state) = inner.cached {
            self.write(state);
        }
    }

    pub fn window_destroyed(&self, label: &str) {
        self.inner.lock().unwrap().closing.remove(label);
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

pub fn initial_placement(monitors: &[Monitor], store: &WindowStateStore) -> InitialPlacement {
    let Some(state) = store.load() else {
        return InitialPlacement {
            width: DEFAULT_WIDTH,
            height: DEFAULT_HEIGHT,
            position: None,
        };
    };

    let (width, height) = clamp_size(state.width, state.height);
    let position = if position_visible(&monitor_rects(monitors), state.x, state.y, width, height) {
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

pub fn cascade_placement(monitors: &[Monitor], from: WindowState) -> InitialPlacement {
    offset_within(&monitor_rects(monitors), from, CASCADE_OFFSET)
}

pub fn same_placement(monitors: &[Monitor], from: WindowState) -> InitialPlacement {
    offset_within(&monitor_rects(monitors), from, 0.0)
}

fn offset_within(monitors: &[Rect], from: WindowState, offset: f64) -> InitialPlacement {
    let (width, height) = clamp_size(from.width, from.height);
    let (x, y) = (from.x + offset, from.y + offset);
    let position = if position_visible(monitors, x, y, width, height) {
        Some((x, y))
    } else {
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

#[derive(Clone, Copy, Debug)]
struct Rect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

fn rects_overlap(a: Rect, b: Rect) -> bool {
    a.x.max(b.x) < (a.x + a.width).min(b.x + b.width)
        && a.y.max(b.y) < (a.y + a.height).min(b.y + b.height)
}

fn monitor_rects(monitors: &[Monitor]) -> Vec<Rect> {
    monitors
        .iter()
        .map(|monitor| {
            let scale = monitor.scale_factor();
            let pos: PhysicalPosition<i32> = *monitor.position();
            let size = monitor.size();
            Rect {
                x: pos.x as f64 / scale,
                y: pos.y as f64 / scale,
                width: size.width as f64 / scale,
                height: size.height as f64 / scale,
            }
        })
        .collect()
}

fn position_visible(monitors: &[Rect], x: f64, y: f64, width: f64, height: f64) -> bool {
    let window = Rect {
        x,
        y,
        width,
        height,
    };
    monitors
        .iter()
        .any(|monitor| rects_overlap(window, *monitor))
}

pub fn capture<R: Runtime>(window: &Window<R>) -> Option<WindowState> {
    if window.is_fullscreen().unwrap_or(false) || window.is_minimized().unwrap_or(false) {
        return None;
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn store_in(temp: &TempDir) -> WindowStateStore {
        WindowStateStore {
            path: temp.path().join("window-state.json"),
            inner: Mutex::new(StoreInner::default()),
        }
    }

    #[test]
    fn clamp_size_enforces_minimums() {
        assert_eq!(clamp_size(100.0, 100.0), (MIN_WIDTH, MIN_HEIGHT));
        assert_eq!(clamp_size(1200.0, 800.0), (1200.0, 800.0));
    }

    #[test]
    fn rects_overlap_detects_intersection_and_separation() {
        let monitor = Rect {
            x: 0.0,
            y: 0.0,
            width: 1920.0,
            height: 1080.0,
        };
        let inside = Rect {
            x: 100.0,
            y: 100.0,
            width: 800.0,
            height: 600.0,
        };
        let off_right = Rect {
            x: 2000.0,
            y: 100.0,
            width: 800.0,
            height: 600.0,
        };
        let touching_edge = Rect {
            x: 1920.0,
            y: 0.0,
            width: 800.0,
            height: 600.0,
        };
        let partial = Rect {
            x: -700.0,
            y: -500.0,
            width: 800.0,
            height: 600.0,
        };
        assert!(rects_overlap(inside, monitor));
        assert!(!rects_overlap(off_right, monitor));
        assert!(!rects_overlap(touching_edge, monitor));
        assert!(rects_overlap(partial, monitor));
    }

    #[test]
    fn store_round_trips_state() {
        let temp = TempDir::new().unwrap();
        let store = store_in(&temp);
        store.update(
            "main",
            WindowState {
                width: 900.0,
                height: 650.0,
                x: 40.0,
                y: 60.0,
            },
        );
        store.flush();
        let loaded = store.load().unwrap();
        assert_eq!(loaded.width, 900.0);
        assert_eq!(loaded.height, 650.0);
        assert_eq!(loaded.x, 40.0);
        assert_eq!(loaded.y, 60.0);
    }

    fn state(width: f64) -> WindowState {
        WindowState {
            width,
            height: 650.0,
            x: 40.0,
            y: 60.0,
        }
    }

    #[test]
    fn a_closing_window_writes_the_state_and_its_later_events_are_ignored() {
        let temp = TempDir::new().unwrap();
        let store = store_in(&temp);
        store.update("main", state(900.0));

        store.window_closing("main");
        assert_eq!(store.load().unwrap().width, 900.0);

        store.update("main", state(1.0));
        store.flush();
        assert_eq!(store.load().unwrap().width, 900.0);
    }

    #[test]
    fn other_windows_keep_updating_while_one_closes() {
        let temp = TempDir::new().unwrap();
        let store = store_in(&temp);
        store.update("main", state(900.0));
        store.window_closing("main");

        store.update("window-1", state(1100.0));
        store.flush();

        assert_eq!(store.load().unwrap().width, 1100.0);
    }

    #[test]
    fn a_destroyed_window_label_can_be_tracked_again() {
        let temp = TempDir::new().unwrap();
        let store = store_in(&temp);
        store.window_closing("window-1");
        store.window_destroyed("window-1");

        store.update("window-1", state(1200.0));
        store.flush();

        assert_eq!(store.load().unwrap().width, 1200.0);
    }

    const SCREEN: Rect = Rect {
        x: 0.0,
        y: 0.0,
        width: 1920.0,
        height: 1080.0,
    };

    #[test]
    fn cascade_offsets_from_the_reference_window_and_keeps_its_size() {
        let placement = offset_within(
            &[SCREEN],
            WindowState {
                width: 1000.0,
                height: 700.0,
                x: 100.0,
                y: 80.0,
            },
            CASCADE_OFFSET,
        );
        assert_eq!((placement.width, placement.height), (1000.0, 700.0));
        assert_eq!(
            placement.position,
            Some((100.0 + CASCADE_OFFSET, 80.0 + CASCADE_OFFSET))
        );
    }

    #[test]
    fn cascade_centers_when_the_offset_position_is_off_screen_or_monitors_are_unknown() {
        let off_screen = WindowState {
            width: 800.0,
            height: 600.0,
            x: 1900.0,
            y: 1060.0,
        };
        assert_eq!(
            offset_within(&[SCREEN], off_screen, CASCADE_OFFSET).position,
            None
        );
        assert_eq!(
            offset_within(&[], state(900.0), CASCADE_OFFSET).position,
            None
        );
    }

    #[test]
    fn a_new_tab_keeps_the_reference_window_frame() {
        let placement = offset_within(&[SCREEN], state(900.0), 0.0);
        assert_eq!((placement.width, placement.height), (900.0, 650.0));
        assert_eq!(placement.position, Some((40.0, 60.0)));
    }

    #[test]
    fn cascade_enforces_the_minimum_size() {
        let placement = offset_within(&[SCREEN], state(100.0), CASCADE_OFFSET);
        assert_eq!(placement.width, MIN_WIDTH);
    }

    #[test]
    fn load_returns_none_without_file() {
        let temp = TempDir::new().unwrap();
        let store = store_in(&temp);
        assert!(store.load().is_none());
    }
}
