use crate::mqtt::{Message, MqttClient, MqttEvents};
use crate::storage::Storage;
use crate::types::{AppData, Button, ButtonColor, Connection, ConnectionStatus, QoS};
use crate::variables;
use clap::{Parser, Subcommand};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

const SUBCOMMANDS: &[&str] = &[
    "connections",
    "buttons",
    "send",
    "publish",
    "subscribe",
    "install",
    "uninstall",
    "skill",
    "help",
];

const SKILL_MD: &str = include_str!("../resources/skill.md");

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const FLUSH_GRACE: Duration = Duration::from_millis(300);

pub fn is_cli_invocation() -> bool {
    match std::env::args().nth(1) {
        Some(first) => {
            SUBCOMMANDS.contains(&first.as_str())
                || matches!(first.as_str(), "--help" | "-h" | "--version" | "-V")
        }
        None => false,
    }
}

#[derive(Parser)]
#[command(
    name = "topic-lab",
    about = "MQTT Topic Lab — send saved MQTT commands from the command line",
    version
)]
struct Cli {
    /// Emit machine-readable JSON instead of human-readable text
    #[arg(long, global = true)]
    json: bool,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// List saved connections
    Connections,
    /// List, add, edit, or delete saved buttons
    Buttons {
        #[command(subcommand)]
        action: ButtonCommand,
    },
    /// Send a saved button by name or id
    Send {
        /// Button name or id
        button: String,
        /// Connection name or id (defaults to the last-used connection)
        #[arg(short, long)]
        connection: Option<String>,
        /// Override a variable as key=value (repeatable)
        #[arg(long = "var", value_name = "KEY=VALUE")]
        vars: Vec<String>,
    },
    /// Publish an ad-hoc message
    Publish {
        /// Connection name or id (defaults to the last-used connection)
        #[arg(short, long)]
        connection: Option<String>,
        /// Topic (supports {variable} substitution)
        #[arg(short, long)]
        topic: String,
        /// Payload (supports {variable} substitution)
        #[arg(short, long, default_value = "")]
        payload: String,
        /// QoS level: 0, 1, or 2
        #[arg(short, long, default_value_t = 0, value_parser = clap::value_parser!(u8).range(0..=2))]
        qos: u8,
        /// Set the retain flag
        #[arg(short, long)]
        retain: bool,
        /// Override a variable as key=value (repeatable)
        #[arg(long = "var", value_name = "KEY=VALUE")]
        vars: Vec<String>,
    },
    /// Subscribe to a topic and print incoming messages
    Subscribe {
        /// Connection name or id (defaults to the last-used connection)
        #[arg(short, long)]
        connection: Option<String>,
        /// Topic filter (supports {variable} substitution)
        #[arg(short, long)]
        topic: String,
        /// QoS level: 0, 1, or 2
        #[arg(short, long, default_value_t = 0, value_parser = clap::value_parser!(u8).range(0..=2))]
        qos: u8,
        /// Exit after N messages (0 = unlimited)
        #[arg(short = 'n', long, default_value_t = 0)]
        count: usize,
        /// Exit after S seconds (0 = no timeout)
        #[arg(long, default_value_t = 0)]
        timeout: u64,
        /// Override a variable as key=value (repeatable)
        #[arg(long = "var", value_name = "KEY=VALUE")]
        vars: Vec<String>,
    },
    /// Symlink this executable onto your PATH as `topic-lab`
    Install {
        /// Directory to install into (default: /usr/local/bin)
        #[arg(long)]
        path: Option<PathBuf>,
        /// Replace an existing `topic-lab` if one is already there
        #[arg(long)]
        force: bool,
    },
    /// Remove the `topic-lab` symlink created by `install`
    Uninstall {
        /// Directory to remove from (default: /usr/local/bin)
        #[arg(long)]
        path: Option<PathBuf>,
    },
    /// Print this CLI's agent skill to stdout
    Skill,
}

#[derive(Subcommand)]
enum ButtonCommand {
    /// List saved buttons
    List {
        /// Connection name or id (defaults to the last-used connection)
        #[arg(short, long)]
        connection: Option<String>,
    },
    /// Add a new button (refused while the desktop app is running)
    Add {
        /// Connection name or id (defaults to the last-used connection)
        #[arg(short, long)]
        connection: Option<String>,
        /// Button name
        #[arg(short, long)]
        name: String,
        /// Topic template (supports {variable} substitution)
        #[arg(short, long)]
        topic: String,
        /// Payload template (supports {variable} substitution)
        #[arg(short, long)]
        payload: Option<String>,
        /// QoS level: 0, 1, or 2
        #[arg(short, long, default_value_t = 0, value_parser = clap::value_parser!(u8).range(0..=2))]
        qos: u8,
        /// Set the retain flag
        #[arg(short, long)]
        retain: bool,
        /// Button color: orange|green|blue|purple|red|teal
        #[arg(long)]
        color: Option<String>,
        /// Group name or id to place the button in
        #[arg(long)]
        group: Option<String>,
    },
    /// Edit an existing button by name or id (refused while the desktop app is running)
    Edit {
        /// Button name or id
        button: String,
        /// Connection name or id (defaults to the last-used connection)
        #[arg(short, long)]
        connection: Option<String>,
        #[arg(long)]
        name: Option<String>,
        #[arg(long)]
        topic: Option<String>,
        #[arg(long)]
        payload: Option<String>,
        #[arg(long, value_parser = clap::value_parser!(u8).range(0..=2))]
        qos: Option<u8>,
        #[arg(long)]
        retain: Option<bool>,
        #[arg(long)]
        color: Option<String>,
        #[arg(long)]
        group: Option<String>,
    },
    /// Delete a button by name or id (refused while the desktop app is running)
    Delete {
        /// Button name or id
        button: String,
        /// Connection name or id (defaults to the last-used connection)
        #[arg(short, long)]
        connection: Option<String>,
    },
}

pub fn run_cli() {
    #[cfg(windows)]
    win_console::attach();

    let cli = Cli::parse();
    let runtime = match tokio::runtime::Runtime::new() {
        Ok(rt) => rt,
        Err(e) => {
            eprintln!("error: failed to start runtime: {e}");
            std::process::exit(1);
        }
    };

    let result = runtime.block_on(run(cli));
    match result {
        Ok(()) => std::process::exit(0),
        Err(e) => {
            eprintln!("error: {e}");
            std::process::exit(1);
        }
    }
}

async fn run(cli: Cli) -> Result<(), String> {
    let json = cli.json;
    let storage = Storage::new().map_err(|e| e.to_string())?;
    let data = storage.load_data().map_err(|e| e.to_string())?;

    match cli.command {
        Command::Connections => list_connections(&data, json),
        Command::Buttons { action } => match action {
            ButtonCommand::List { connection } => list_buttons(&data, connection.as_deref(), json),
            ButtonCommand::Add {
                connection,
                name,
                topic,
                payload,
                qos,
                retain,
                color,
                group,
            } => button_add(
                &storage,
                connection.as_deref(),
                name,
                topic,
                payload,
                qos,
                retain,
                color.as_deref(),
                group.as_deref(),
                json,
            ),
            ButtonCommand::Edit {
                button,
                connection,
                name,
                topic,
                payload,
                qos,
                retain,
                color,
                group,
            } => button_edit(
                &storage,
                &button,
                connection.as_deref(),
                name,
                topic,
                payload,
                qos,
                retain,
                color.as_deref(),
                group.as_deref(),
                json,
            ),
            ButtonCommand::Delete { button, connection } => {
                button_delete(&storage, &button, connection.as_deref(), json)
            }
        },
        Command::Send {
            button,
            connection,
            vars,
        } => send(&data, &button, connection.as_deref(), &vars, json).await,
        Command::Publish {
            connection,
            topic,
            payload,
            qos,
            retain,
            vars,
        } => {
            publish(
                &data,
                connection.as_deref(),
                &topic,
                &payload,
                qos,
                retain,
                &vars,
                json,
            )
            .await
        }
        Command::Subscribe {
            connection,
            topic,
            qos,
            count,
            timeout,
            vars,
        } => {
            subscribe(
                &data,
                connection.as_deref(),
                &topic,
                qos,
                count,
                timeout,
                &vars,
                json,
            )
            .await
        }
        Command::Install { path, force } => cmd_install(path, force, json),
        Command::Uninstall { path } => cmd_uninstall(path, json),
        Command::Skill => cmd_skill(),
    }
}

fn list_connections(data: &AppData, json: bool) -> Result<(), String> {
    if json {
        let rows: Vec<_> = data
            .connections
            .iter()
            .map(|c| {
                serde_json::json!({
                    "id": c.id,
                    "name": c.name,
                    "broker_url": c.broker_url,
                    "port": c.port,
                    "use_tls": c.use_tls,
                    "buttons": c.buttons.len(),
                })
            })
            .collect();
        println!("{}", serde_json::to_string_pretty(&rows).unwrap());
    } else if data.connections.is_empty() {
        println!("no connections configured");
    } else {
        for c in &data.connections {
            let tls = if c.use_tls { " tls" } else { "" };
            println!(
                "{}  {}:{}{}  ({} buttons)  [{}]",
                c.name,
                c.broker_url,
                c.port,
                tls,
                c.buttons.len(),
                c.id
            );
        }
    }
    Ok(())
}

fn list_buttons(data: &AppData, selector: Option<&str>, json: bool) -> Result<(), String> {
    let conn = resolve_connection(data, selector)?;
    if json {
        let rows: Vec<_> = conn
            .buttons
            .iter()
            .map(|b| {
                serde_json::json!({
                    "id": b.id,
                    "name": b.name,
                    "topic": b.topic,
                    "payload": b.payload,
                    "qos": b.qos,
                    "retain": b.retain,
                })
            })
            .collect();
        println!("{}", serde_json::to_string_pretty(&rows).unwrap());
    } else if conn.buttons.is_empty() {
        println!("no buttons in connection '{}'", conn.name);
    } else {
        for b in &conn.buttons {
            match &b.payload {
                Some(p) => println!("{}  ->  {}  ({})", b.name, b.topic, p),
                None => println!("{}  ->  {}", b.name, b.topic),
            }
        }
    }
    Ok(())
}

async fn send(
    data: &AppData,
    button_selector: &str,
    connection: Option<&str>,
    var_overrides: &[String],
    json: bool,
) -> Result<(), String> {
    let conn = resolve_connection(data, connection)?;
    let button = conn
        .buttons
        .iter()
        .find(|b| b.id == button_selector || b.name == button_selector)
        .ok_or_else(|| format!("button not found: {button_selector}"))?;

    let vars = merged_vars(conn, parse_var_overrides(var_overrides)?);
    let topic = variables::substitute_variables(&button.topic, &vars);
    let payload = button
        .payload
        .as_deref()
        .map(|p| variables::substitute_variables(p, &vars))
        .unwrap_or_default();

    deliver(conn, &topic, &payload, button.qos, button.retain).await?;
    report_publish(&topic, &payload, button.qos, button.retain, json);
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn publish(
    data: &AppData,
    connection: Option<&str>,
    topic: &str,
    payload: &str,
    qos: u8,
    retain: bool,
    var_overrides: &[String],
    json: bool,
) -> Result<(), String> {
    let conn = resolve_connection(data, connection)?;
    let vars = merged_vars(conn, parse_var_overrides(var_overrides)?);
    let topic = variables::substitute_variables(topic, &vars);
    let payload = variables::substitute_variables(payload, &vars);
    let qos = qos_from_u8(qos);

    deliver(conn, &topic, &payload, qos, retain).await?;
    report_publish(&topic, &payload, qos, retain, json);
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn subscribe(
    data: &AppData,
    connection: Option<&str>,
    topic: &str,
    qos: u8,
    count: usize,
    timeout: u64,
    var_overrides: &[String],
    json: bool,
) -> Result<(), String> {
    let conn = resolve_connection(data, connection)?;
    let vars = merged_vars(conn, parse_var_overrides(var_overrides)?);
    let topic = variables::substitute_variables(topic, &vars);
    let qos = qos_from_u8(qos);

    let counter = Arc::new(AtomicUsize::new(0));
    let printer = Arc::new(CliPrinter {
        json,
        counter: Arc::clone(&counter),
    });

    let mut client = MqttClient::new();
    client.set_events(printer);
    client.connect(conn).await.map_err(|e| e.to_string())?;
    wait_connected(&client).await?;
    client.subscribe(&topic, qos).await.map_err(|e| e.to_string())?;
    if !json {
        eprintln!("subscribed to {topic} (ctrl-c to stop)");
    }

    let deadline = (timeout > 0).then(|| Instant::now() + Duration::from_secs(timeout));
    loop {
        if count > 0 && counter.load(Ordering::Relaxed) >= count {
            break;
        }
        if let Some(d) = deadline {
            if Instant::now() >= d {
                break;
            }
        }
        tokio::select! {
            _ = tokio::time::sleep(Duration::from_millis(100)) => {}
            _ = tokio::signal::ctrl_c() => break,
        }
    }

    client.disconnect().await.map_err(|e| e.to_string())?;
    Ok(())
}

async fn deliver(
    conn: &Connection,
    topic: &str,
    payload: &str,
    qos: QoS,
    retain: bool,
) -> Result<(), String> {
    let mut client = MqttClient::new();
    client.connect(conn).await.map_err(|e| e.to_string())?;
    wait_connected(&client).await?;
    client
        .publish(topic, payload, qos, retain)
        .await
        .map_err(|e| e.to_string())?;
    tokio::time::sleep(FLUSH_GRACE).await;
    client.disconnect().await.map_err(|e| e.to_string())?;
    Ok(())
}

async fn wait_connected(client: &MqttClient) -> Result<(), String> {
    let deadline = Instant::now() + CONNECT_TIMEOUT;
    loop {
        match client.get_status().await {
            ConnectionStatus::Connected => return Ok(()),
            ConnectionStatus::Error => return Err("connection failed".into()),
            _ => {}
        }
        if Instant::now() >= deadline {
            return Err("timed out waiting for connection".into());
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

fn report_publish(topic: &str, payload: &str, qos: QoS, retain: bool, json: bool) {
    if json {
        let out = serde_json::json!({
            "sent": true,
            "topic": topic,
            "payload": payload,
            "qos": qos,
            "retain": retain,
        });
        println!("{}", serde_json::to_string(&out).unwrap());
    } else {
        println!("sent to {topic}");
    }
}

fn find_connection_index(data: &AppData, selector: Option<&str>) -> Result<usize, String> {
    if data.connections.is_empty() {
        return Err("no connections configured".into());
    }
    match selector {
        Some(sel) => data
            .connections
            .iter()
            .position(|c| c.id == sel || c.name == sel)
            .ok_or_else(|| format!("connection not found: {sel}")),
        None => {
            if let Some(id) = &data.last_connection_id {
                if let Some(pos) = data.connections.iter().position(|c| &c.id == id) {
                    return Ok(pos);
                }
            }
            Ok(0)
        }
    }
}

fn resolve_connection<'a>(
    data: &'a AppData,
    selector: Option<&str>,
) -> Result<&'a Connection, String> {
    let idx = find_connection_index(data, selector)?;
    Ok(&data.connections[idx])
}

fn acquire_write_or_refuse(storage: &Storage) -> Result<std::fs::File, String> {
    match storage.acquire_write_lock().map_err(|e| e.to_string())? {
        Some(guard) => Ok(guard),
        None => Err("MQTT Topic Lab is open (or another change is in progress); configuration \
             changes are disabled while it runs. Quit the app — it takes precedence — and try again."
            .into()),
    }
}

fn parse_color(value: &str) -> Result<ButtonColor, String> {
    match value.to_lowercase().as_str() {
        "orange" => Ok(ButtonColor::Orange),
        "green" => Ok(ButtonColor::Green),
        "blue" => Ok(ButtonColor::Blue),
        "purple" => Ok(ButtonColor::Purple),
        "red" => Ok(ButtonColor::Red),
        "teal" => Ok(ButtonColor::Teal),
        other => Err(format!(
            "invalid color: {other} (expected orange|green|blue|purple|red|teal)"
        )),
    }
}

fn resolve_group(conn: &Connection, selector: &str) -> Result<String, String> {
    conn.groups
        .iter()
        .find(|g| g.id == selector || g.name == selector)
        .map(|g| g.id.clone())
        .ok_or_else(|| format!("group not found: {selector}"))
}

fn find_button_index(conn: &Connection, selector: &str) -> Result<usize, String> {
    conn.buttons
        .iter()
        .position(|b| b.id == selector || b.name == selector)
        .ok_or_else(|| format!("button not found: {selector}"))
}

#[allow(clippy::too_many_arguments)]
fn button_add(
    storage: &Storage,
    connection: Option<&str>,
    name: String,
    topic: String,
    payload: Option<String>,
    qos: u8,
    retain: bool,
    color: Option<&str>,
    group: Option<&str>,
    json: bool,
) -> Result<(), String> {
    let _guard = acquire_write_or_refuse(storage)?;
    let mut data = storage.load_data().map_err(|e| e.to_string())?;
    let idx = find_connection_index(&data, connection)?;

    let color = match color {
        Some(c) => Some(parse_color(c)?),
        None => None,
    };
    let group_id = match group {
        Some(g) => Some(resolve_group(&data.connections[idx], g)?),
        None => None,
    };

    let button = Button {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        topic,
        payload,
        qos: qos_from_u8(qos),
        retain,
        color,
        multi_send_enabled: None,
        multi_send_interval: None,
        group_id,
    };
    let id = button.id.clone();
    let name = button.name.clone();
    data.connections[idx].buttons.push(button);
    storage.save_data(&data).map_err(|e| e.to_string())?;

    if json {
        println!("{}", serde_json::json!({ "added": true, "id": id, "name": name }));
    } else {
        println!("added button '{name}' [{id}]");
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn button_edit(
    storage: &Storage,
    button_selector: &str,
    connection: Option<&str>,
    name: Option<String>,
    topic: Option<String>,
    payload: Option<String>,
    qos: Option<u8>,
    retain: Option<bool>,
    color: Option<&str>,
    group: Option<&str>,
    json: bool,
) -> Result<(), String> {
    let _guard = acquire_write_or_refuse(storage)?;
    let mut data = storage.load_data().map_err(|e| e.to_string())?;
    let idx = find_connection_index(&data, connection)?;

    let new_color = match color {
        Some(c) => Some(parse_color(c)?),
        None => None,
    };
    let new_group_id = match group {
        Some(g) => Some(resolve_group(&data.connections[idx], g)?),
        None => None,
    };
    let bidx = find_button_index(&data.connections[idx], button_selector)?;

    let button = &mut data.connections[idx].buttons[bidx];
    if let Some(n) = name {
        button.name = n;
    }
    if let Some(t) = topic {
        button.topic = t;
    }
    if let Some(p) = payload {
        button.payload = Some(p);
    }
    if let Some(q) = qos {
        button.qos = qos_from_u8(q);
    }
    if let Some(r) = retain {
        button.retain = r;
    }
    if let Some(c) = new_color {
        button.color = Some(c);
    }
    if let Some(gid) = new_group_id {
        button.group_id = Some(gid);
    }
    let id = button.id.clone();
    let name = button.name.clone();
    storage.save_data(&data).map_err(|e| e.to_string())?;

    if json {
        println!("{}", serde_json::json!({ "updated": true, "id": id, "name": name }));
    } else {
        println!("updated button '{name}' [{id}]");
    }
    Ok(())
}

fn button_delete(
    storage: &Storage,
    button_selector: &str,
    connection: Option<&str>,
    json: bool,
) -> Result<(), String> {
    let _guard = acquire_write_or_refuse(storage)?;
    let mut data = storage.load_data().map_err(|e| e.to_string())?;
    let idx = find_connection_index(&data, connection)?;
    let bidx = find_button_index(&data.connections[idx], button_selector)?;
    let removed = data.connections[idx].buttons.remove(bidx);
    storage.save_data(&data).map_err(|e| e.to_string())?;

    if json {
        println!(
            "{}",
            serde_json::json!({ "deleted": true, "id": removed.id, "name": removed.name })
        );
    } else {
        println!("deleted button '{}' [{}]", removed.name, removed.id);
    }
    Ok(())
}

fn cmd_install(path: Option<PathBuf>, force: bool, json: bool) -> Result<(), String> {
    let report = crate::install::install(path, force).map_err(|e| e.message())?;
    if json {
        println!("{}", serde_json::to_string(&report).unwrap());
    } else {
        let status = if report.already {
            "already installed"
        } else {
            "installed"
        };
        println!(
            "{status}: {} -> {}",
            report.path.display(),
            report.target.display()
        );
        if !report.on_path {
            if let Some(parent) = report.path.parent() {
                println!("note: {} is not on your PATH", parent.display());
            }
        }
    }
    Ok(())
}

fn cmd_uninstall(path: Option<PathBuf>, json: bool) -> Result<(), String> {
    let link = crate::install::uninstall(path)?;
    if json {
        println!("{}", serde_json::json!({ "uninstalled": true, "path": link }));
    } else {
        println!("uninstalled: {}", link.display());
    }
    Ok(())
}

fn cmd_skill() -> Result<(), String> {
    print!("{SKILL_MD}");
    Ok(())
}

fn parse_var_overrides(overrides: &[String]) -> Result<HashMap<String, String>, String> {
    let mut map = HashMap::new();
    for entry in overrides {
        let (key, value) = entry
            .split_once('=')
            .ok_or_else(|| format!("invalid --var (expected key=value): {entry}"))?;
        map.insert(key.to_string(), value.to_string());
    }
    Ok(map)
}

fn merged_vars(conn: &Connection, overrides: HashMap<String, String>) -> HashMap<String, String> {
    let mut vars = conn.variables.clone();
    vars.extend(overrides);
    vars
}

fn qos_from_u8(qos: u8) -> QoS {
    match qos {
        1 => QoS::AtLeastOnce,
        2 => QoS::ExactlyOnce,
        _ => QoS::AtMostOnce,
    }
}

struct CliPrinter {
    json: bool,
    counter: Arc<AtomicUsize>,
}

impl MqttEvents for CliPrinter {
    fn on_status(&self, _status: &str) {}

    fn on_message(&self, message: &Message) {
        self.counter.fetch_add(1, Ordering::Relaxed);
        if self.json {
            if let Ok(line) = serde_json::to_string(message) {
                println!("{line}");
            }
        } else {
            println!("{}  {}", message.topic, message.payload);
        }
    }
}

#[cfg(windows)]
mod win_console {
    #[link(name = "kernel32")]
    extern "system" {
        fn AttachConsole(process_id: u32) -> i32;
    }

    pub fn attach() {
        const ATTACH_PARENT_PROCESS: u32 = u32::MAX;
        unsafe {
            let _ = AttachConsole(ATTACH_PARENT_PROCESS);
        }
    }
}
