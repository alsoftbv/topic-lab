use serde::Serialize;
#[cfg(any(unix, windows))]
use std::path::Path;
use std::path::PathBuf;

pub const CLI_NAME: &str = "topic-lab";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallReport {
    pub path: PathBuf,
    pub target: PathBuf,
    pub on_path: bool,
    pub already: bool,
}

pub enum InstallError {
    Permission {
        dir: PathBuf,
        link: PathBuf,
        target: PathBuf,
    },
    Other(String),
}

impl InstallError {
    pub fn message(&self) -> String {
        match self {
            InstallError::Permission { dir, link, target } => format!(
                "permission denied writing to {}.\nRun this in a terminal:\n  sudo ln -sf \"{}\" \"{}\"\nor pick a writable directory (e.g. --path ~/.local/bin).",
                dir.display(),
                target.display(),
                link.display()
            ),
            InstallError::Other(s) => s.clone(),
        }
    }
}

/// GUI entry point: install to the default location, and on macOS fall back to an
/// admin-authenticated install (native password prompt) when the directory needs root.
pub fn install_for_gui() -> Result<InstallReport, String> {
    match install(None, false) {
        Ok(report) => Ok(report),
        Err(e) => {
            #[cfg(target_os = "macos")]
            if let InstallError::Permission { link, target, .. } = &e {
                return install_elevated_macos(target, link);
            }
            Err(e.message())
        }
    }
}

#[cfg(unix)]
pub fn default_bin_dir() -> PathBuf {
    PathBuf::from("/usr/local/bin")
}

#[cfg(unix)]
pub fn dir_on_path(dir: &Path) -> bool {
    std::env::var_os("PATH")
        .map(|paths| std::env::split_paths(&paths).any(|p| p == dir))
        .unwrap_or(false)
}

/// Symlink the running executable into `dir` (default `/usr/local/bin`) as `topic-lab`.
#[cfg(unix)]
pub fn install(dir: Option<PathBuf>, force: bool) -> Result<InstallReport, InstallError> {
    let target = std::env::current_exe()
        .map_err(|e| InstallError::Other(format!("cannot resolve executable: {e}")))?;
    let target = target.canonicalize().unwrap_or(target);
    let dir = dir.unwrap_or_else(default_bin_dir);
    let link = dir.join(CLI_NAME);

    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| {
            if e.kind() == std::io::ErrorKind::PermissionDenied {
                InstallError::Permission {
                    dir: dir.clone(),
                    link: link.clone(),
                    target: target.clone(),
                }
            } else {
                InstallError::Other(format!("cannot create {}: {e}", dir.display()))
            }
        })?;
    }

    if std::fs::symlink_metadata(&link).is_ok() {
        if std::fs::read_link(&link).ok().as_deref() == Some(target.as_path()) {
            return Ok(InstallReport {
                path: link,
                target,
                on_path: dir_on_path(&dir),
                already: true,
            });
        }
        if !force {
            return Err(InstallError::Other(format!(
                "{} already exists (use --force to replace)",
                link.display()
            )));
        }
        std::fs::remove_file(&link)
            .map_err(|e| InstallError::Other(format!("cannot replace {}: {e}", link.display())))?;
    }

    std::os::unix::fs::symlink(&target, &link).map_err(|e| {
        if e.kind() == std::io::ErrorKind::PermissionDenied {
            InstallError::Permission {
                dir: dir.clone(),
                link: link.clone(),
                target: target.clone(),
            }
        } else {
            InstallError::Other(format!("failed to create {}: {e}", link.display()))
        }
    })?;

    Ok(InstallReport {
        path: link,
        target,
        on_path: dir_on_path(&dir),
        already: false,
    })
}

#[cfg(unix)]
pub fn uninstall(dir: Option<PathBuf>) -> Result<PathBuf, String> {
    let dir = dir.unwrap_or_else(default_bin_dir);
    let link = dir.join(CLI_NAME);
    if std::fs::symlink_metadata(&link).is_err() {
        return Err(format!("not installed at {}", link.display()));
    }
    std::fs::remove_file(&link).map_err(|e| format!("cannot remove {}: {e}", link.display()))?;
    Ok(link)
}

#[cfg(target_os = "macos")]
fn install_elevated_macos(target: &Path, link: &Path) -> Result<InstallReport, String> {
    let dir = link.parent().ok_or("invalid install path")?;
    // The paths are wrapped in single quotes inside an AppleScript `do shell script`;
    // refuse the rare case of a single quote to keep escaping unambiguous.
    if [target, link].iter().any(|p| p.to_string_lossy().contains('\'')) {
        return Err("path contains a single quote; please install manually".into());
    }
    let script = format!(
        "do shell script \"mkdir -p '{}' && ln -sf '{}' '{}'\" with administrator privileges",
        dir.display(),
        target.display(),
        link.display()
    );
    let output = std::process::Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| format!("could not launch the privilege prompt: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("-128") || stderr.to_lowercase().contains("cancel") {
            return Err("installation cancelled".into());
        }
        return Err(format!("elevated install failed: {}", stderr.trim()));
    }

    Ok(InstallReport {
        path: link.to_path_buf(),
        target: target.to_path_buf(),
        on_path: dir_on_path(dir),
        already: false,
    })
}

// Windows: there are no symlinks-on-PATH conventions, so drop a `topic-lab.cmd` shim
// into a per-user dir and add that dir to the user PATH (no admin needed).
#[cfg(windows)]
pub fn default_bin_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("topic-lab")
        .join("bin")
}

#[cfg(windows)]
pub fn install(dir: Option<PathBuf>, force: bool) -> Result<InstallReport, InstallError> {
    let exe = std::env::current_exe()
        .map_err(|e| InstallError::Other(format!("cannot resolve executable: {e}")))?;
    let dir = dir.unwrap_or_else(default_bin_dir);
    std::fs::create_dir_all(&dir)
        .map_err(|e| InstallError::Other(format!("cannot create {}: {e}", dir.display())))?;
    let shim = dir.join("topic-lab.cmd");
    let script = format!("@\"{}\" %*\r\n", exe.display());

    if std::fs::symlink_metadata(&shim).is_ok() {
        if std::fs::read_to_string(&shim).map(|c| c == script).unwrap_or(false) {
            add_to_user_path(&dir).map_err(InstallError::Other)?;
            return Ok(InstallReport {
                path: shim,
                target: exe,
                on_path: true,
                already: true,
            });
        }
        if !force {
            return Err(InstallError::Other(format!(
                "{} already exists (use --force to replace)",
                shim.display()
            )));
        }
    }

    std::fs::write(&shim, &script)
        .map_err(|e| InstallError::Other(format!("cannot write {}: {e}", shim.display())))?;
    add_to_user_path(&dir).map_err(InstallError::Other)?;

    Ok(InstallReport {
        path: shim,
        target: exe,
        on_path: true,
        already: false,
    })
}

#[cfg(windows)]
pub fn uninstall(dir: Option<PathBuf>) -> Result<PathBuf, String> {
    let dir = dir.unwrap_or_else(default_bin_dir);
    let shim = dir.join("topic-lab.cmd");
    if std::fs::symlink_metadata(&shim).is_err() {
        return Err(format!("not installed at {}", shim.display()));
    }
    std::fs::remove_file(&shim).map_err(|e| format!("cannot remove {}: {e}", shim.display()))?;
    let _ = remove_from_user_path(&dir);
    Ok(shim)
}

#[cfg(windows)]
fn run_powershell(script: &str) -> Result<(), String> {
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .map_err(|e| format!("could not run powershell: {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "could not update PATH: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

// `[Environment]::SetEnvironmentVariable(..., 'User')` writes the per-user PATH
// (preserving its registry type) and broadcasts WM_SETTINGCHANGE so new shells pick it up.
#[cfg(windows)]
fn add_to_user_path(dir: &Path) -> Result<(), String> {
    let d = dir.to_string_lossy().replace('\'', "''");
    run_powershell(&format!(
        "$d='{d}'; $p=[Environment]::GetEnvironmentVariable('Path','User'); if (-not $p) {{ $p='' }}; if (($p -split ';') -notcontains $d) {{ if ($p) {{ $p=$p.TrimEnd(';')+';'+$d }} else {{ $p=$d }}; [Environment]::SetEnvironmentVariable('Path',$p,'User') }}"
    ))
}

#[cfg(windows)]
fn remove_from_user_path(dir: &Path) -> Result<(), String> {
    let d = dir.to_string_lossy().replace('\'', "''");
    run_powershell(&format!(
        "$d='{d}'; $p=[Environment]::GetEnvironmentVariable('Path','User'); if ($p) {{ $new=(($p -split ';') | Where-Object {{ $_ -and ($_ -ne $d) }}) -join ';'; if ($new -ne $p) {{ [Environment]::SetEnvironmentVariable('Path',$new,'User') }} }}"
    ))
}

#[cfg(not(any(unix, windows)))]
pub fn install(_dir: Option<PathBuf>, _force: bool) -> Result<InstallReport, InstallError> {
    Err(InstallError::Other(
        "installing a `topic-lab` command isn't supported on this platform.".into(),
    ))
}

#[cfg(not(any(unix, windows)))]
pub fn uninstall(_dir: Option<PathBuf>) -> Result<PathBuf, String> {
    Err("install isn't supported on this platform.".into())
}
