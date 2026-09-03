use crate::mqtt::{Message, MqttClient, MqttEvents};
use crate::storage::Storage;
use crate::types::{AppData, Button, ButtonColor, Connection, QoS};
use crate::variables;
use clap::{Parser, Subcommand};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Notify;

const SUBCOMMANDS: &[&str] = &[
    "connections",
    "buttons",
    "variables",
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
const MAX_VARIABLE_HISTORY: usize = 5;

#[cfg(not(windows))]
const INSTALL_DIR_HELP: &str =
    "Directory to install into (default: ~/.local/bin if it's on your PATH, else /usr/local/bin)";
#[cfg(windows)]
const INSTALL_DIR_HELP: &str = "Directory to install into (default: %LOCALAPPDATA%\\topic-lab\\bin)";
#[cfg(not(windows))]
const UNINSTALL_DIR_HELP: &str =
    "Directory to remove from (default: finds the install in ~/.local/bin, /usr/local/bin, or on your PATH)";
#[cfg(windows)]
const UNINSTALL_DIR_HELP: &str = "Directory to remove from (default: %LOCALAPPDATA%\\topic-lab\\bin)";

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
    about = "MQTT Topic Lab CLI: send saved MQTT commands from the command line",
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
    /// List saved connections, or select the active one
    Connections {
        #[command(subcommand)]
        action: ConnectionCommand,
    },
    /// List, add, edit, or delete saved buttons
    Buttons {
        #[command(subcommand)]
        action: ButtonCommand,
    },
    /// List, set, or unset a connection's variables
    Variables {
        #[command(subcommand)]
        action: VariableCommand,
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
        #[arg(long, help = INSTALL_DIR_HELP)]
        path: Option<PathBuf>,
        /// Replace an existing `topic-lab` if one is already there
        #[arg(long)]
        force: bool,
    },
    /// Remove the `topic-lab` symlink created by `install`
    Uninstall {
        #[arg(long, help = UNINSTALL_DIR_HELP)]
        path: Option<PathBuf>,
    },
    /// Print this CLI's agent skill to stdout
    Skill,
}

#[derive(Subcommand)]
enum ConnectionCommand {
    /// List saved connections (the active one is marked)
    List,
    /// Set the active connection used when --connection is omitted (refused while the app runs)
    Select {
        /// Connection name or id
        connection: String,
    },
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
        /// Remove the payload
        #[arg(long, conflicts_with = "payload")]
        clear_payload: bool,
        /// Reset the color to the default
        #[arg(long, conflicts_with = "color")]
        clear_color: bool,
        /// Move the button out of its group
        #[arg(long, conflicts_with = "group")]
        clear_group: bool,
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

#[derive(Subcommand)]
enum VariableCommand {
    /// List a connection's variables
    List {
        /// Connection name or id (defaults to the last-used connection)
        #[arg(short, long)]
        connection: Option<String>,
    },
    /// Set a variable's value (refused while the desktop app is running)
    Set {
        /// Variable name
        key: String,
        /// Variable value
        value: String,
        /// Connection name or id (defaults to the last-used connection)
        #[arg(short, long)]
        connection: Option<String>,
    },
    /// Remove a variable (refused while the desktop app is running)
    Unset {
        /// Variable name
        key: String,
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
    let load = || storage.load_data().map_err(|e| e.to_string());

    match cli.command {
        Command::Connections { action } => match action {
            ConnectionCommand::List => list_connections(&load()?, json),
            ConnectionCommand::Select { connection } => {
                connection_select(&storage, &connection, json)
            }
        },
        Command::Buttons { action } => match action {
            ButtonCommand::List { connection } => {
                list_buttons(&load()?, connection.as_deref(), json)
            }
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
                NewButton {
                    name,
                    topic,
                    payload,
                    qos,
                    retain,
                    color: color.as_deref().map(parse_color).transpose()?,
                    group,
                },
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
                clear_payload,
                clear_color,
                clear_group,
            } => button_edit(
                &storage,
                &button,
                connection.as_deref(),
                ButtonEdits {
                    name,
                    topic,
                    payload,
                    qos,
                    retain,
                    color: color.as_deref().map(parse_color).transpose()?,
                    group,
                    clear_payload,
                    clear_color,
                    clear_group,
                },
                json,
            ),
            ButtonCommand::Delete { button, connection } => {
                button_delete(&storage, &button, connection.as_deref(), json)
            }
        },
        Command::Variables { action } => match action {
            VariableCommand::List { connection } => {
                list_variables(&load()?, connection.as_deref(), json)
            }
            VariableCommand::Set {
                key,
                value,
                connection,
            } => variable_set(&storage, connection.as_deref(), &key, &value, json),
            VariableCommand::Unset { key, connection } => {
                variable_unset(&storage, connection.as_deref(), &key, json)
            }
        },
        Command::Send {
            button,
            connection,
            vars,
        } => send(&load()?, &button, connection.as_deref(), &vars, json).await,
        Command::Publish {
            connection,
            topic,
            payload,
            qos,
            retain,
            vars,
        } => {
            publish(
                &load()?,
                connection.as_deref(),
                PublishRequest {
                    topic,
                    payload,
                    qos,
                    retain,
                    vars,
                },
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
                &load()?,
                connection.as_deref(),
                SubscribeRequest {
                    topic,
                    qos,
                    count,
                    timeout,
                    vars,
                },
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
    let active = data.last_connection_id.as_deref();
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
                    "active": active == Some(c.id.as_str()),
                })
            })
            .collect();
        println!("{}", serde_json::to_string_pretty(&rows).unwrap());
    } else if data.connections.is_empty() {
        println!("no connections configured");
    } else {
        for c in &data.connections {
            let marker = if active == Some(c.id.as_str()) { "*" } else { " " };
            let tls = if c.use_tls { " tls" } else { "" };
            println!(
                "{} {}  {}:{}{}  ({} buttons)  [{}]",
                marker,
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

fn connection_select(storage: &Storage, selector: &str, json: bool) -> Result<(), String> {
    let (id, name) = with_locked_data(storage, Some(selector), |data, idx| {
        let id = data.connections[idx].id.clone();
        let name = data.connections[idx].name.clone();
        data.last_connection_id = Some(id.clone());
        Ok((id, name))
    })?;

    if json {
        println!("{}", serde_json::json!({ "selected": true, "id": id, "name": name }));
    } else {
        println!("active connection: {name} [{id}]");
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
    let (topic, payload) = variables::resolve_button(button, &vars);

    deliver(conn, &topic, &payload, button.qos, button.retain).await?;
    report_publish(&topic, &payload, button.qos, button.retain, json);
    Ok(())
}

struct PublishRequest {
    topic: String,
    payload: String,
    qos: u8,
    retain: bool,
    vars: Vec<String>,
}

async fn publish(
    data: &AppData,
    connection: Option<&str>,
    req: PublishRequest,
    json: bool,
) -> Result<(), String> {
    let conn = resolve_connection(data, connection)?;
    let vars = merged_vars(conn, parse_var_overrides(&req.vars)?);
    let topic = variables::substitute_variables(&req.topic, &vars);
    let payload = variables::substitute_variables(&req.payload, &vars);
    let qos = qos_from_u8(req.qos);

    deliver(conn, &topic, &payload, qos, req.retain).await?;
    report_publish(&topic, &payload, qos, req.retain, json);
    Ok(())
}

struct SubscribeRequest {
    topic: String,
    qos: u8,
    count: usize,
    timeout: u64,
    vars: Vec<String>,
}

async fn subscribe(
    data: &AppData,
    connection: Option<&str>,
    req: SubscribeRequest,
    json: bool,
) -> Result<(), String> {
    let SubscribeRequest {
        topic,
        qos,
        count,
        timeout,
        vars,
    } = req;
    let conn = resolve_connection(data, connection)?;
    let vars = merged_vars(conn, parse_var_overrides(&vars)?);
    let topic = variables::substitute_variables(&topic, &vars);
    let qos = qos_from_u8(qos);

    let counter = Arc::new(AtomicUsize::new(0));
    let done = Arc::new(Notify::new());
    let printer = Arc::new(CliPrinter {
        json,
        counter: Arc::clone(&counter),
        limit: count,
        done: Arc::clone(&done),
    });

    let mut client = MqttClient::new();
    client.set_events(printer);
    client
        .connect(&cli_client(conn))
        .await
        .map_err(|e| e.to_string())?;
    client
        .wait_connected(CONNECT_TIMEOUT)
        .await
        .map_err(|e| e.to_string())?;
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
        if !client.is_running() {
            client.disconnect().await;
            return Err("connection lost".into());
        }
        tokio::select! {
            _ = tokio::time::sleep(Duration::from_millis(100)) => {}
            _ = done.notified() => break,
            _ = tokio::signal::ctrl_c() => break,
        }
    }

    client.disconnect().await;
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
    client
        .connect(&cli_client(conn))
        .await
        .map_err(|e| e.to_string())?;
    client
        .wait_connected(CONNECT_TIMEOUT)
        .await
        .map_err(|e| e.to_string())?;
    client
        .publish(topic, payload, qos, retain)
        .await
        .map_err(|e| e.to_string())?;
    tokio::time::sleep(FLUSH_GRACE).await;
    client.disconnect().await;
    Ok(())
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
             changes are disabled while it runs. Quit the app and try again."
            .into()),
    }
}

fn with_locked_data<T>(
    storage: &Storage,
    connection: Option<&str>,
    f: impl FnOnce(&mut AppData, usize) -> Result<T, String>,
) -> Result<T, String> {
    let _guard = acquire_write_or_refuse(storage)?;
    let mut data = storage.load_data().map_err(|e| e.to_string())?;
    let idx = find_connection_index(&data, connection)?;
    let out = f(&mut data, idx)?;
    storage.save_data(&data).map_err(|e| e.to_string())?;
    Ok(out)
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

struct NewButton {
    name: String,
    topic: String,
    payload: Option<String>,
    qos: u8,
    retain: bool,
    color: Option<ButtonColor>,
    group: Option<String>,
}

fn button_add(
    storage: &Storage,
    connection: Option<&str>,
    new: NewButton,
    json: bool,
) -> Result<(), String> {
    let (id, name) = with_locked_data(storage, connection, |data, idx| {
        let group_id = new
            .group
            .as_deref()
            .map(|g| resolve_group(&data.connections[idx], g))
            .transpose()?;
        let button = Button {
            id: uuid::Uuid::new_v4().to_string(),
            name: new.name,
            topic: new.topic,
            payload: new.payload,
            qos: qos_from_u8(new.qos),
            retain: new.retain,
            color: new.color,
            multi_send_enabled: None,
            multi_send_interval: None,
            group_id,
        };
        let id = button.id.clone();
        let name = button.name.clone();
        data.connections[idx].buttons.push(button);
        Ok((id, name))
    })?;

    if json {
        println!("{}", serde_json::json!({ "added": true, "id": id, "name": name }));
    } else {
        println!("added button '{name}' [{id}]");
    }
    Ok(())
}

struct ButtonEdits {
    name: Option<String>,
    topic: Option<String>,
    payload: Option<String>,
    qos: Option<u8>,
    retain: Option<bool>,
    color: Option<ButtonColor>,
    group: Option<String>,
    clear_payload: bool,
    clear_color: bool,
    clear_group: bool,
}

fn button_edit(
    storage: &Storage,
    button_selector: &str,
    connection: Option<&str>,
    edits: ButtonEdits,
    json: bool,
) -> Result<(), String> {
    let (id, name) = with_locked_data(storage, connection, |data, idx| {
        let new_group_id = edits
            .group
            .as_deref()
            .map(|g| resolve_group(&data.connections[idx], g))
            .transpose()?;
        let bidx = find_button_index(&data.connections[idx], button_selector)?;

        let button = &mut data.connections[idx].buttons[bidx];
        if let Some(n) = edits.name {
            button.name = n;
        }
        if let Some(t) = edits.topic {
            button.topic = t;
        }
        if let Some(p) = edits.payload {
            button.payload = Some(p);
        }
        if edits.clear_payload {
            button.payload = None;
        }
        if let Some(q) = edits.qos {
            button.qos = qos_from_u8(q);
        }
        if let Some(r) = edits.retain {
            button.retain = r;
        }
        if let Some(c) = edits.color {
            button.color = Some(c);
        }
        if edits.clear_color {
            button.color = None;
        }
        if let Some(gid) = new_group_id {
            button.group_id = Some(gid);
        }
        if edits.clear_group {
            button.group_id = None;
        }
        Ok((button.id.clone(), button.name.clone()))
    })?;

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
    let removed = with_locked_data(storage, connection, |data, idx| {
        let bidx = find_button_index(&data.connections[idx], button_selector)?;
        Ok(data.connections[idx].buttons.remove(bidx))
    })?;

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

fn list_variables(data: &AppData, selector: Option<&str>, json: bool) -> Result<(), String> {
    let conn = resolve_connection(data, selector)?;
    if json {
        println!("{}", serde_json::to_string_pretty(&conn.variables).unwrap());
    } else if conn.variables.is_empty() {
        println!("no variables in connection '{}'", conn.name);
    } else {
        let mut keys: Vec<&String> = conn.variables.keys().collect();
        keys.sort();
        for key in keys {
            println!("{key} = {}", conn.variables[key]);
        }
    }
    Ok(())
}

fn push_variable_history(history: &mut HashMap<String, Vec<String>>, key: &str, old_value: &str) {
    let entry = history.entry(key.to_string()).or_default();
    entry.retain(|v| v != old_value);
    entry.insert(0, old_value.to_string());
    entry.truncate(MAX_VARIABLE_HISTORY);
}

fn variable_set(
    storage: &Storage,
    connection: Option<&str>,
    key: &str,
    value: &str,
    json: bool,
) -> Result<(), String> {
    with_locked_data(storage, connection, |data, idx| {
        let conn = &mut data.connections[idx];
        if let Some(old_value) = conn.variables.get(key) {
            if old_value != value {
                let old_value = old_value.clone();
                push_variable_history(&mut conn.variable_history, key, &old_value);
            }
        }
        conn.variables.insert(key.to_string(), value.to_string());
        Ok(())
    })?;

    if json {
        println!(
            "{}",
            serde_json::json!({ "set": true, "key": key, "value": value })
        );
    } else {
        println!("set {key} = {value}");
    }
    Ok(())
}

fn variable_unset(
    storage: &Storage,
    connection: Option<&str>,
    key: &str,
    json: bool,
) -> Result<(), String> {
    with_locked_data(storage, connection, |data, idx| {
        let conn = &mut data.connections[idx];
        if conn.variables.remove(key).is_none() {
            return Err(format!("variable not found: {key}"));
        }
        conn.variable_history.remove(key);
        Ok(())
    })?;

    if json {
        println!("{}", serde_json::json!({ "unset": true, "key": key }));
    } else {
        println!("unset {key}");
    }
    Ok(())
}

fn cmd_install(path: Option<PathBuf>, force: bool, json: bool) -> Result<(), String> {
    let report = crate::install::install(path, force).map_err(|e| e.to_string())?;
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

fn cli_client(conn: &Connection) -> Connection {
    let mut conn = conn.clone();
    conn.client_id = format!("{}-cli", conn.client_id);
    conn
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
    limit: usize,
    done: Arc<Notify>,
}

impl MqttEvents for CliPrinter {
    fn on_status(&self, _status: &str) {}

    fn on_message(&self, message: &Message) {
        let seen = self.counter.fetch_add(1, Ordering::Relaxed) + 1;
        if self.limit > 0 && seen > self.limit {
            return;
        }
        if self.json {
            if let Ok(line) = serde_json::to_string(message) {
                println!("{line}");
            }
        } else {
            println!("{}  {}", message.topic, message.payload);
        }
        if self.limit > 0 && seen == self.limit {
            self.done.notify_one();
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

#[cfg(test)]
mod tests {
    use super::*;

    fn conn(client_id: &str) -> Connection {
        Connection {
            id: "id".into(),
            name: "n".into(),
            broker_url: "localhost".into(),
            port: 1883,
            client_id: client_id.into(),
            username: None,
            password: None,
            use_tls: false,
            ca_cert_path: None,
            client_cert_path: None,
            client_key_path: None,
            auto_connect: false,
            variables: HashMap::new(),
            variable_history: HashMap::new(),
            buttons: vec![],
            groups: vec![],
            subscriptions: vec![],
        }
    }

    #[test]
    fn cli_client_suffixes_the_id() {
        assert_eq!(cli_client(&conn("device-123")).client_id, "device-123-cli");
    }

    #[test]
    fn qos_from_u8_maps_levels() {
        assert!(matches!(qos_from_u8(0), QoS::AtMostOnce));
        assert!(matches!(qos_from_u8(1), QoS::AtLeastOnce));
        assert!(matches!(qos_from_u8(2), QoS::ExactlyOnce));
    }

    #[test]
    fn parse_var_overrides_splits_on_first_equals() {
        let map = parse_var_overrides(&["a=1".into(), "b=two=2".into()]).unwrap();
        assert_eq!(map.get("a"), Some(&"1".to_string()));
        assert_eq!(map.get("b"), Some(&"two=2".to_string()));
        assert!(parse_var_overrides(&["nope".into()]).is_err());
    }

    #[test]
    fn push_variable_history_prepends_old_value() {
        let mut history = HashMap::new();
        push_variable_history(&mut history, "mac", "11:22:33");
        push_variable_history(&mut history, "mac", "44:55:66");
        assert_eq!(history["mac"], vec!["44:55:66", "11:22:33"]);
    }

    #[test]
    fn push_variable_history_dedupes_and_moves_to_front() {
        let mut history = HashMap::new();
        push_variable_history(&mut history, "mac", "a");
        push_variable_history(&mut history, "mac", "b");
        push_variable_history(&mut history, "mac", "a");
        assert_eq!(history["mac"], vec!["a", "b"]);
    }

    #[test]
    fn push_variable_history_caps_at_max() {
        let mut history = HashMap::new();
        for i in 0..(MAX_VARIABLE_HISTORY + 3) {
            push_variable_history(&mut history, "k", &i.to_string());
        }
        assert_eq!(history["k"].len(), MAX_VARIABLE_HISTORY);
        assert_eq!(history["k"][0], (MAX_VARIABLE_HISTORY + 2).to_string());
    }
}
