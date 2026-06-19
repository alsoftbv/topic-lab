---
name: topic-lab
description: Drive the MQTT Topic Lab CLI to list saved connections and buttons, send saved buttons, publish ad-hoc messages, and subscribe to topics. Use when an agent needs to send or receive MQTT messages using the connections, buttons, and variables already configured in the MQTT Topic Lab desktop app.
---

# MQTT Topic Lab CLI

MQTT Topic Lab is a desktop app for sending saved MQTT commands. The CLI is the **same executable** as the desktop app — when invoked with a subcommand it runs headless and exits instead of opening a window. It reads the same configuration the GUI uses (`data.json`), so any connection, button, or variable defined in the app is available from the CLI.

> This skill is embedded in the CLI: run `topic-lab skill` to print it to stdout.

**The desktop app takes precedence.** Commands that change configuration (`buttons add`/`edit`/`delete`) work only when the app is **not** running — while it is open they are refused (coordinated via an OS advisory lock), so the CLI can never clobber the app's state. All other commands (listing, `send`, `publish`, `subscribe`) never modify `data.json` and are always available, even while the app is open.

## Invoking the CLI

The CLI is one binary named `mqtt-topic-lab`, run with a subcommand. Use whichever path applies:

- If a `topic-lab` shortcut is on `PATH`, use `topic-lab <command>`.
- macOS app bundle: `"/Applications/MQTT Topic Lab.app/Contents/MacOS/mqtt-topic-lab" <command>`
- In this repository after a build: `./src-tauri/target/release/mqtt-topic-lab <command>` (or `target/debug/...`).
- From source during development: `cargo run --manifest-path src-tauri/Cargo.toml --bin mqtt-topic-lab -- <command>`.

To put `topic-lab` on your PATH permanently, run the binary's `install` subcommand once (`uninstall` removes it). On Unix it symlinks the executable into `/usr/local/bin` (override with `--path`); on Windows it adds a `topic-lab.cmd` shim to your user `PATH`:
```
"/Applications/MQTT Topic Lab.app/Contents/MacOS/mqtt-topic-lab" install
# Unix, if /usr/local/bin isn't writable:
"/Applications/MQTT Topic Lab.app/Contents/MacOS/mqtt-topic-lab" install --path ~/.local/bin
```
(The desktop app's Preferences → Command Line also has an **Install** / **Add to PATH** button.) Otherwise, alias it: `alias topic-lab="/Applications/MQTT Topic Lab.app/Contents/MacOS/mqtt-topic-lab"`. Examples below use `topic-lab`.

Add `--json` to any command for machine-readable output (recommended for agents). Exit code is `0` on success, non-zero on failure (errors print to stderr).

## Configuration / data location

Configuration lives at `<data-dir>/mqtt-topic-lab/data.json`, where `<data-dir>` is the OS data directory:

- macOS: `~/Library/Application Support/mqtt-topic-lab/data.json`
- Linux: `$XDG_DATA_HOME/mqtt-topic-lab/data.json` (default `~/.local/share/mqtt-topic-lab/data.json`)
- Windows: `%APPDATA%\mqtt-topic-lab\data.json`

Override the directory with the `MQTT_TOPIC_LAB_DATA_DIR` environment variable (useful for tests or pointing at an alternate profile).

## Commands

### List connections
```
topic-lab connections --json
```
Returns each saved connection's `id`, `name`, `broker_url`, `port`, `use_tls`, and button count. Use the `name` or `id` as the `--connection` selector for other commands.

### List buttons
```
topic-lab buttons list --connection <name|id> --json
```
Lists saved buttons with their `id`, `name`, `topic` (raw template, e.g. `devices/{device_id}/cmd`), `payload`, `qos`, and `retain`. Omit `--connection` to use the last-used connection.

### Add / edit / delete buttons (requires the app to be closed)
```
topic-lab buttons add --connection prod --name "Turn On" --topic "devices/{device_id}/cmd" --payload "ON" --qos 1 --color green --group Lights
topic-lab buttons edit "Turn On" --connection prod --payload "OFF" --retain true
topic-lab buttons delete "Turn On" --connection prod
```
- `add` flags: `--name` and `--topic` are required; `--payload`, `--qos 0|1|2`, `--retain`, `--color orange|green|blue|purple|red|teal`, `--group <name|id>` are optional.
- `edit` takes the button `name` or `id` as a positional argument, then only the flags you want to change (`--name`, `--topic`, `--payload`, `--qos`, `--retain true|false`, `--color`, `--group`).
- `delete` takes the button `name` or `id`.
- These store templates verbatim (`{variable}` is **not** expanded at write time — it is resolved when the button is sent).
- If the desktop app is running, these print an error to stderr and exit non-zero without changing anything; close the app and retry.

### Send a saved button
```
topic-lab send "Turn On" --connection prod --var device_id=sensor-42
```
Finds the button by `name` or `id`, substitutes variables, connects, publishes, and disconnects. `--var key=value` (repeatable) overrides the connection's saved variables for this send only; nothing is persisted.

### Publish an ad-hoc message
```
topic-lab publish --connection prod --topic "devices/{device_id}/cmd" --payload "ON" --qos 1 --var device_id=sensor-42
```
Publishes a one-off message. Topic and payload support `{variable}` substitution. Flags: `--qos 0|1|2` (default 0), `--retain`.

### Subscribe to a topic
```
topic-lab subscribe --connection prod --topic "devices/{device_id}/+" --count 5 --timeout 30 --json
```
Connects, subscribes, and prints each incoming message (one JSON object per line with `--json`, or `topic  payload` otherwise) until it has received `--count` messages or `--timeout` seconds elapse, whichever comes first. With neither bound it runs until interrupted (Ctrl-C). `0` means unbounded for both.

## Variables

Topics and payloads use `{variable_name}` syntax. Custom variables come from the connection (override per-invocation with `--var`). Built-in dynamic variables are also supported:

- `{now}` / `{timestamp}` — current time. Modifiers: format (`{now:unix}`, `{now:unixms}`, `{now:date}`, `{now:time}`, `{now:datetime}`, `{now:iso}`), timezone (`{now:utc}`), offset (`{now:+5m}`, `{now:-1h}`, units `s m h d w M y`).
- `{uuid}` — a random v4 UUID.
- `{random}` / `{rand}` — a random integer 0–100, or a range with `{random:1-1000}`.

## Notes

- `send`, `publish`, and `subscribe` require a reachable broker; the connection times out after ~10s if it can't connect.
- A `send`/`publish` waits briefly after publishing to flush the message before disconnecting.
- The CLI shares `data.json` with the desktop app but only reads it, so concurrent use with the running app is safe.
