use objc2::msg_send;
use objc2::runtime::AnyObject;
use tauri::{Runtime, WebviewWindow};

pub const SHOW_PREVIOUS_TAB: &str = "show_previous_tab";
pub const SHOW_NEXT_TAB: &str = "show_next_tab";
pub const MOVE_TAB_TO_NEW_WINDOW: &str = "move_tab_to_new_window";
pub const MERGE_ALL_WINDOWS: &str = "merge_all_windows";

const NS_WINDOW_TABBING_MODE_PREFERRED: isize = 1;

pub fn is_tab_action(id: &str) -> bool {
    [
        SHOW_PREVIOUS_TAB,
        SHOW_NEXT_TAB,
        MOVE_TAB_TO_NEW_WINDOW,
        MERGE_ALL_WINDOWS,
    ]
    .contains(&id)
}

pub fn prefer_tab<R: Runtime>(window: &WebviewWindow<R>) {
    let Ok(pointer) = window.ns_window() else {
        return;
    };
    let ns_window = unsafe { &*(pointer as *const AnyObject) };
    unsafe {
        let () = msg_send![ns_window, setTabbingMode: NS_WINDOW_TABBING_MODE_PREFERRED];
    }
}

pub fn perform<R: Runtime>(window: &WebviewWindow<R>, id: &str) {
    let Ok(pointer) = window.ns_window() else {
        return;
    };
    let ns_window = unsafe { &*(pointer as *const AnyObject) };
    let sender = std::ptr::null::<AnyObject>();
    unsafe {
        match id {
            SHOW_PREVIOUS_TAB => {
                let () = msg_send![ns_window, selectPreviousTab: sender];
            }
            SHOW_NEXT_TAB => {
                let () = msg_send![ns_window, selectNextTab: sender];
            }
            MOVE_TAB_TO_NEW_WINDOW => {
                let () = msg_send![ns_window, moveTabToNewWindow: sender];
            }
            MERGE_ALL_WINDOWS => {
                let () = msg_send![ns_window, mergeAllWindows: sender];
            }
            _ => {}
        }
    }
}
