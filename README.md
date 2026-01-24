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

## License

MIT
