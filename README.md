# MQTT Topic Lab

A desktop application for sending saved MQTT commands via configurable buttons. Built with Tauri (Rust) and React.

## Features

- **Project-based Variables**: Define variables like `device_id` once, use them in multiple buttons with `{device_id}` syntax
- **Button Commands**: Create buttons with customizable topics, payloads, QoS levels, and retain flags
- **Auto-connect**: Automatically connects to your MQTT broker on startup
- **TLS Support**: Secure connections with TLS/SSL
- **Cross-platform**: Works on Windows, Linux, and macOS

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/)
- Platform-specific dependencies for Tauri (see [Tauri Prerequisites](https://tauri.app/start/prerequisites/))

### Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev
```

### Testing

```bash
# Run frontend tests
npm test

# Run Rust backend tests
cd src-tauri && cargo test
```

### Building

```bash
# Build for production
npm run tauri build
```

## Usage

1. **First Launch**: Configure your MQTT broker connection (URL, port, credentials)
2. **Add Variables**: Define project variables (e.g., `device_id = "sensor-001"`)
3. **Create Buttons**: Add buttons with topics like `devices/{device_id}/CMD`
4. **Send Commands**: Click buttons to publish messages to your MQTT broker

## Variables

Use `{variable_name}` syntax in topics and payloads. Variables are defined per connection in the Variables panel.

### Custom Variables

Define your own variables like `device_id = "sensor-001"`, then use `{device_id}` in topics or payloads.

### Built-in Variables

| Variable | Description | Example Output |
|----------|-------------|----------------|
| `{now}` | ISO 8601 timestamp | `2026-02-19T14:30:00.000Z` |
| `{now:unix}` | Unix timestamp (seconds) | `1771508400` |
| `{now:unixms}` | Unix timestamp (milliseconds) | `1771508400000` |
| `{now:date}` | Date only | `2026-02-19` |
| `{now:time}` | Time only | `14:30:00` |
| `{now:datetime}` | Date and time | `2026-02-19 14:30:00` |
| `{uuid}` | Random UUID v4 | `a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5` |
| `{random}` | Random integer 0-100 | `42` |
| `{random:1-1000}` | Random integer in range | `537` |

`{timestamp}` is an alias for `{now}`, and `{rand}` is an alias for `{random}`.

### Modifiers

Modifiers are added with `:` after the variable name and can be combined.

**Time offsets**: `{now:+5m}`, `{now:-1h}`, `{now:+7d}`, `{now:+2w}`, `{now:+1M}`, `{now:+1y}`
- Units: `s` (seconds), `m` (minutes), `h` (hours), `d` (days), `w` (weeks), `M` (months), `y` (years)

**Timezone**: `{now:utc}` or `{now:local}` (default is local)

**Custom format**: `{now:fmt:YYYY-MM-DD}`, `{now:fmt:HH:mm:ss}`
- Tokens: `YYYY`, `YY`, `MM`, `M`, `DD`, `D`, `HH`, `H`, `mm`, `ss`, `SSS`

**Combined**: `{now:unix:+1h}`, `{now:utc:fmt:YYYY-MM-DD_HH:mm}`

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + 1-9, 0` | Quick send buttons 1-10 |
| `Arrow keys` | Navigate between buttons |
| `Enter` | Send selected button |
| `Escape` | Deselect button / Close search |
| `Cmd/Ctrl + N` | New button |
| `Cmd/Ctrl + E` | Edit selected button |
| `Cmd/Ctrl + C` | Copy selected button |
| `Cmd/Ctrl + V` | Paste copied button |
| `Cmd/Ctrl + D` | Duplicate selected button |
| `Cmd/Ctrl + F` | Search buttons |
| `Cmd/Ctrl + T` | Toggle message viewer |
| `Delete / Backspace` | Delete selected button |

## License

MIT
