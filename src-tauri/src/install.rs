use serde::Serialize;
#[cfg(any(unix, windows))]
use std::path::Path;
use std::path::PathBuf;
use thiserror::Error;

pub const CLI_NAME: &str = "topic-lab";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallReport {
    pub path: PathBuf,
    pub target: PathBuf,
    pub on_path: bool,
    pub already: bool,
}

#[derive(Error, Debug)]
pub enum InstallError {
    #[cfg_attr(not(unix), allow(dead_code))]
    #[error(
        "permission denied writing to {}\n\n\
        To install there with administrator access, run:\n\n  \
        sudo \"{}\" install --path \"{}\"\n\n\
        Or pick a directory you can write to:\n\n  \
        \"{}\" install --path ~/.local/bin",
        dir.display(),
        target.display(),
        dir.display(),
        target.display()
    )]
    Permission {
        dir: PathBuf,
        link: PathBuf,
        target: PathBuf,
    },
    #[error("{0}")]
    Other(String),
}

pub fn install_for_gui() -> Result<InstallReport, String> {
    match install(None, false) {
        Ok(report) => Ok(report),
        Err(e) => {
            #[cfg(target_os = "macos")]
            if let InstallError::Permission { link, target, .. } = &e {
                return install_elevated_macos(target, link);
            }
            #[cfg(all(unix, not(target_os = "macos")))]
            if let InstallError::Permission { link, target, .. } = &e {
                return install_elevated_linux(target, link);
            }
            Err(e.to_string())
        }
    }
}

#[cfg(unix)]
fn preferred_bin_dir(home: Option<PathBuf>, path_var: Option<&std::ffi::OsStr>) -> PathBuf {
    if let (Some(home), Some(paths)) = (home, path_var) {
        let local = home.join(".local").join("bin");
        if std::env::split_paths(paths).any(|p| p == local) {
            return local;
        }
    }
    PathBuf::from("/usr/local/bin")
}

#[cfg(unix)]
pub fn default_bin_dir() -> PathBuf {
    preferred_bin_dir(dirs::home_dir(), std::env::var_os("PATH").as_deref())
}

#[cfg(unix)]
pub fn dir_on_path(dir: &Path) -> bool {
    std::env::var_os("PATH")
        .map(|paths| std::env::split_paths(&paths).any(|p| p == dir))
        .unwrap_or(false)
}

#[cfg(unix)]
fn existing_on_path(path_var: Option<&std::ffi::OsStr>) -> Option<PathBuf> {
    let paths = path_var?;
    std::env::split_paths(paths)
        .filter(|p| !p.as_os_str().is_empty())
        .map(|p| p.join(CLI_NAME))
        .find(|link| std::fs::symlink_metadata(link).is_ok())
}

#[cfg(unix)]
pub fn install(dir: Option<PathBuf>, force: bool) -> Result<InstallReport, InstallError> {
    let target = std::env::current_exe()
        .map_err(|e| InstallError::Other(format!("cannot resolve executable: {e}")))?;
    let target = target.canonicalize().unwrap_or(target);
    let explicit = dir.is_some();
    let dir = dir.unwrap_or_else(default_bin_dir);
    let link = dir.join(CLI_NAME);

    if !explicit {
        if let Some(existing) = existing_on_path(std::env::var_os("PATH").as_deref()) {
            if existing != link {
                if std::fs::canonicalize(&existing).ok().as_deref() == Some(&target) {
                    return Ok(InstallReport {
                        path: existing,
                        target,
                        on_path: true,
                        already: true,
                    });
                }
                if !force {
                    return Err(InstallError::Other(format!(
                        "a different `topic-lab` is already on your PATH at {}\n\n\
                        To replace it, run:\n\n  \
                        \"{}\" install --path \"{}\" --force",
                        existing.display(),
                        target.display(),
                        existing.parent().unwrap_or(Path::new("/")).display()
                    )));
                }
            }
        }
    }

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
    match dir {
        Some(d) => remove_installed_link(&d.join(CLI_NAME)),
        None => {
            let mut defaults: Vec<PathBuf> = dirs::home_dir()
                .map(|h| vec![h.join(".local").join("bin")])
                .unwrap_or_default();
            defaults.push(PathBuf::from("/usr/local/bin"));
            let target = std::env::current_exe()
                .ok()
                .map(|t| t.canonicalize().unwrap_or(t));
            uninstall_search(
                &defaults,
                std::env::var_os("PATH").as_deref(),
                target.as_deref(),
            )
        }
    }
}

#[cfg(unix)]
fn uninstall_search(
    defaults: &[PathBuf],
    path_var: Option<&std::ffi::OsStr>,
    target: Option<&Path>,
) -> Result<PathBuf, String> {
    let mut candidates = defaults.to_vec();
    if let Some(paths) = path_var {
        for p in std::env::split_paths(paths) {
            if !p.as_os_str().is_empty() && !candidates.contains(&p) {
                candidates.push(p);
            }
        }
    }

    if let Some(target) = target {
        for dir in &candidates {
            let link = dir.join(CLI_NAME);
            let Ok(meta) = std::fs::symlink_metadata(&link) else {
                continue;
            };
            if meta.file_type().is_symlink()
                && std::fs::canonicalize(&link).ok().as_deref() == Some(target)
            {
                return remove_installed_link(&link);
            }
        }
    }

    for dir in defaults {
        let link = dir.join(CLI_NAME);
        let Ok(meta) = std::fs::symlink_metadata(&link) else {
            continue;
        };
        if meta.file_type().is_symlink() {
            return remove_installed_link(&link);
        }
        return Err(format!(
            "{} is not a symlink created by `topic-lab install`; refusing to remove it",
            link.display()
        ));
    }

    Err(format!(
        "not installed (checked {} and the directories on your PATH)",
        defaults
            .iter()
            .map(|d| d.join(CLI_NAME).display().to_string())
            .collect::<Vec<_>>()
            .join(", ")
    ))
}

#[cfg(unix)]
fn remove_installed_link(link: &Path) -> Result<PathBuf, String> {
    let meta = std::fs::symlink_metadata(link)
        .map_err(|_| format!("not installed at {}", link.display()))?;
    if !meta.file_type().is_symlink() {
        return Err(format!(
            "{} is not a symlink created by `topic-lab install`; refusing to remove it",
            link.display()
        ));
    }
    std::fs::remove_file(link).map_err(|e| {
        if e.kind() == std::io::ErrorKind::PermissionDenied {
            format!(
                "permission denied removing {}\n\nRun this in a terminal:\n\n  sudo rm \"{}\"",
                link.display(),
                link.display()
            )
        } else {
            format!("cannot remove {}: {e}", link.display())
        }
    })?;
    Ok(link.to_path_buf())
}

#[cfg(unix)]
fn shell_safe(path: &Path) -> bool {
    !path
        .to_string_lossy()
        .contains(['\'', '"', '\\', '`', '$'])
}

#[cfg(all(unix, not(target_os = "macos")))]
fn install_elevated_linux(target: &Path, link: &Path) -> Result<InstallReport, String> {
    let dir = link.parent().ok_or("invalid install path")?;
    let manual = format!(
        "Administrator access is required to install to {}.\n\nRun this in a terminal:\n\n  sudo ln -sf \"{}\" \"{}\"",
        dir.display(),
        target.display(),
        link.display()
    );
    if ![target, link, dir].iter().all(|p| shell_safe(p)) {
        return Err(manual);
    }
    let script = format!(
        "mkdir -p '{}' && ln -sf '{}' '{}'",
        dir.display(),
        target.display(),
        link.display()
    );
    let output = match std::process::Command::new("pkexec")
        .args(["sh", "-c", &script])
        .output()
    {
        Ok(output) => output,
        Err(_) => return Err(manual),
    };
    if output.status.success() {
        return Ok(InstallReport {
            path: link.to_path_buf(),
            target: target.to_path_buf(),
            on_path: dir_on_path(dir),
            already: false,
        });
    }
    if output.status.code() == Some(126) {
        return Err("installation cancelled".into());
    }
    Err(manual)
}

#[cfg(target_os = "macos")]
fn install_elevated_macos(target: &Path, link: &Path) -> Result<InstallReport, String> {
    let dir = link.parent().ok_or("invalid install path")?;
    if ![target, link, dir].iter().all(|p| shell_safe(p)) {
        return Err("path contains a shell-unsafe character; please install manually".into());
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

#[cfg(windows)]
pub fn default_bin_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(CLI_NAME)
        .join("bin")
}

#[cfg(windows)]
pub fn install(dir: Option<PathBuf>, force: bool) -> Result<InstallReport, InstallError> {
    let exe = std::env::current_exe()
        .map_err(|e| InstallError::Other(format!("cannot resolve executable: {e}")))?;
    let dir = dir.unwrap_or_else(default_bin_dir);
    std::fs::create_dir_all(&dir)
        .map_err(|e| InstallError::Other(format!("cannot create {}: {e}", dir.display())))?;
    let shim = dir.join(format!("{CLI_NAME}.cmd"));
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
    let shim = dir.join(format!("{CLI_NAME}.cmd"));
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

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn install_creates_symlink_to_current_exe() {
        let temp = TempDir::new().unwrap();
        let report = install(Some(temp.path().to_path_buf()), false).unwrap();
        assert!(!report.already);
        assert_eq!(report.path, temp.path().join(CLI_NAME));
        let target = std::fs::read_link(&report.path).unwrap();
        assert_eq!(target, report.target);
    }

    #[test]
    fn install_twice_reports_already() {
        let temp = TempDir::new().unwrap();
        install(Some(temp.path().to_path_buf()), false).unwrap();
        let report = install(Some(temp.path().to_path_buf()), false).unwrap();
        assert!(report.already);
    }

    #[test]
    fn install_refuses_foreign_file_without_force() {
        let temp = TempDir::new().unwrap();
        let link = temp.path().join(CLI_NAME);
        std::fs::write(&link, "something else").unwrap();
        let err = install(Some(temp.path().to_path_buf()), false).unwrap_err();
        assert!(err.to_string().contains("already exists"));
        assert_eq!(std::fs::read(&link).unwrap(), b"something else");
    }

    #[test]
    fn install_force_replaces_existing() {
        let temp = TempDir::new().unwrap();
        let link = temp.path().join(CLI_NAME);
        std::fs::write(&link, "something else").unwrap();
        let report = install(Some(temp.path().to_path_buf()), true).unwrap();
        assert!(!report.already);
        assert!(std::fs::read_link(&link).is_ok());
    }

    #[test]
    fn uninstall_removes_installed_symlink() {
        let temp = TempDir::new().unwrap();
        install(Some(temp.path().to_path_buf()), false).unwrap();
        let removed = uninstall(Some(temp.path().to_path_buf())).unwrap();
        assert!(std::fs::symlink_metadata(&removed).is_err());
    }

    #[test]
    fn uninstall_refuses_non_symlink() {
        let temp = TempDir::new().unwrap();
        let link = temp.path().join(CLI_NAME);
        std::fs::write(&link, "unrelated binary").unwrap();
        let err = uninstall(Some(temp.path().to_path_buf())).unwrap_err();
        assert!(err.contains("refusing"));
        assert!(link.exists());
    }

    #[test]
    fn uninstall_errors_when_not_installed() {
        let temp = TempDir::new().unwrap();
        let err = uninstall(Some(temp.path().to_path_buf())).unwrap_err();
        assert!(err.contains("not installed"));
    }

    #[test]
    fn shell_safe_rejects_quote_backslash_and_expansion_chars() {
        assert!(shell_safe(Path::new("/usr/local/bin/topic-lab")));
        assert!(shell_safe(Path::new("/Users/name with spaces/bin")));
        for bad in ["a'b", "a\"b", "a\\b", "a`b", "a$b"] {
            assert!(!shell_safe(Path::new(bad)), "{bad} should be rejected");
        }
    }

    #[test]
    fn preferred_bin_dir_picks_local_bin_when_on_path() {
        let home = PathBuf::from("/home/user");
        let local = home.join(".local").join("bin");
        let paths = std::env::join_paths([PathBuf::from("/usr/bin"), local.clone()]).unwrap();
        assert_eq!(preferred_bin_dir(Some(home), Some(&paths)), local);
    }

    #[test]
    fn preferred_bin_dir_falls_back_to_usr_local_bin() {
        let home = PathBuf::from("/home/user");
        let paths = std::env::join_paths([PathBuf::from("/usr/bin")]).unwrap();
        let fallback = PathBuf::from("/usr/local/bin");
        assert_eq!(preferred_bin_dir(Some(home), Some(&paths)), fallback);
        assert_eq!(preferred_bin_dir(None, None), fallback);
    }

    #[test]
    fn existing_on_path_finds_first_entry() {
        let empty = TempDir::new().unwrap();
        let occupied = TempDir::new().unwrap();
        std::fs::write(occupied.path().join(CLI_NAME), "x").unwrap();
        let paths = std::env::join_paths([empty.path(), occupied.path()]).unwrap();
        assert_eq!(
            existing_on_path(Some(&paths)),
            Some(occupied.path().join(CLI_NAME))
        );
        let none = std::env::join_paths([empty.path()]).unwrap();
        assert_eq!(existing_on_path(Some(&none)), None);
        assert_eq!(existing_on_path(None), None);
    }

    #[test]
    fn uninstall_search_removes_our_install_found_via_path() {
        let default_dir = TempDir::new().unwrap();
        let custom = TempDir::new().unwrap();
        let report = install(Some(custom.path().to_path_buf()), false).unwrap();
        let paths = std::env::join_paths([custom.path()]).unwrap();
        let removed = uninstall_search(
            &[default_dir.path().to_path_buf()],
            Some(&paths),
            Some(&report.target),
        )
        .unwrap();
        assert_eq!(removed, custom.path().join(CLI_NAME));
        assert!(std::fs::symlink_metadata(&removed).is_err());
    }

    #[test]
    fn uninstall_search_falls_back_to_stale_symlink_in_defaults() {
        let default_dir = TempDir::new().unwrap();
        let link = default_dir.path().join(CLI_NAME);
        std::os::unix::fs::symlink("/nonexistent/old-app", &link).unwrap();
        let removed = uninstall_search(
            &[default_dir.path().to_path_buf()],
            None,
            Some(Path::new("/current/exe")),
        )
        .unwrap();
        assert_eq!(removed, link);
    }

    #[test]
    fn uninstall_search_leaves_foreign_topic_lab_on_path_alone() {
        let default_dir = TempDir::new().unwrap();
        let foreign = TempDir::new().unwrap();
        std::fs::write(foreign.path().join(CLI_NAME), "other tool").unwrap();
        let paths = std::env::join_paths([foreign.path()]).unwrap();
        let err = uninstall_search(
            &[default_dir.path().to_path_buf()],
            Some(&paths),
            Some(Path::new("/current/exe")),
        )
        .unwrap_err();
        assert!(err.contains("not installed"));
        assert!(foreign.path().join(CLI_NAME).exists());
    }

    #[test]
    fn permission_error_suggests_sudo_and_writable_dir() {
        let err = InstallError::Permission {
            dir: PathBuf::from("/usr/local/bin"),
            link: PathBuf::from("/usr/local/bin/topic-lab"),
            target: PathBuf::from("/usr/bin/mqtt-topic-lab"),
        };
        let msg = err.to_string();
        assert!(msg.starts_with("permission denied writing to /usr/local/bin"));
        assert!(msg.contains("sudo \"/usr/bin/mqtt-topic-lab\" install --path \"/usr/local/bin\""));
        assert!(msg.contains("install --path ~/.local/bin"));
    }
}
