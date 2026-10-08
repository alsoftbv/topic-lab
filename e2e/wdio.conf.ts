import os from "os";
import path from "path";
import fs from "fs";
import { spawn, spawnSync, type ChildProcess } from "child_process";
import { fileURLToPath } from "url";
import { startBroker, stopBroker } from "./broker.js";
import { APP_VERSION, RELEASE_NOTES } from "./release-notes.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

let tauriDriver: ChildProcess | null = null;
let exit = false;

const testDataDir =
  process.env.MQTT_TOPIC_LAB_DATA_DIR || path.join(os.tmpdir(), "mqtt-topic-lab-e2e");
process.env.MQTT_TOPIC_LAB_DATA_DIR = testDataDir;

const binaryName = os.platform() === "win32" ? "mqtt-topic-lab.exe" : "mqtt-topic-lab";

const binaryPath = path.resolve(__dirname, "..", "src-tauri", "target", "debug", binaryName);

export const config = {
  host: "127.0.0.1",
  port: 4444,
  specs: ["./specs/**/*.ts"],
  maxInstances: 1,
  capabilities: [
    {
      maxInstances: 1,
      "tauri:options": {
        application: binaryPath,
      },
    },
  ],
  logLevel: "warn",
  reporters: ["spec"],
  framework: "mocha",
  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },

  onPrepare: async () => {
    await startBroker();
    console.log("MQTT broker started on port 1883");

    fs.mkdirSync(testDataDir, { recursive: true });
    console.log(`Test data dir: ${testDataDir}`);

    const buildResult = spawnSync(
      "npm",
      ["run", "tauri", "build", "--", "--debug", "--no-bundle"],
      {
        cwd: path.resolve(__dirname, ".."),
        stdio: "inherit",
        shell: true,
        env: { ...process.env, TOPIC_LAB_RELEASE_NOTES: RELEASE_NOTES },
      }
    );

    if (buildResult.status !== 0) {
      throw new Error(`Tauri build failed with exit code ${buildResult.status}`);
    }
  },

  beforeSession: (_config: unknown, _capabilities: unknown, specs: string[]) => {
    const specFile = specs?.[0] || "";
    const dataFile = path.join(testDataDir, "data.json");
    const showsReleaseNotes = specFile.includes("release-notes") || specFile.includes("screens");

    if (specFile.includes("01-setup-wizard")) {
      if (fs.existsSync(dataFile)) fs.unlinkSync(dataFile);
    } else {
      const defaultData = {
        connections: [
          {
            id: "e2e-default",
            name: "E2E Test Connection",
            broker_url: "localhost",
            port: 1883,
            client_id: "mqtt-topic-lab-e2e",
            auto_connect: false,
            use_tls: false,
            variables: {},
            buttons: [
              {
                id: "e2e-btn-1",
                name: "Test Button",
                topic: "test/e2e",
                payload: "hello",
                qos: "atmostonce",
                retain: false,
              },
            ],
            groups: [],
            subscriptions: [],
          },
        ],
        last_connection_id: "e2e-default",
        settings: {
          lastSeenVersion: showsReleaseNotes ? "0.0.0" : APP_VERSION,
        },
      };
      if (specFile.includes("multi-window")) {
        defaultData.connections.push({
          ...defaultData.connections[0],
          id: "e2e-second",
          name: "Second Connection",
          buttons: [],
        });
        defaultData.connections.push({
          ...defaultData.connections[0],
          id: "e2e-third",
          name: "Third Connection",
          client_id: "mqtt-topic-lab-e2e-third",
          buttons: [],
        });
      }
      fs.writeFileSync(dataFile, JSON.stringify(defaultData));
    }

    tauriDriver = spawn(path.resolve(os.homedir(), ".cargo", "bin", "tauri-driver"), [], {
      stdio: [null, process.stdout, process.stderr],
      env: process.env,
    });

    tauriDriver.on("error", (error: Error) => {
      console.error("tauri-driver error:", error);
      process.exit(1);
    });

    tauriDriver.on("exit", (code: number | null) => {
      if (!exit) {
        console.error("tauri-driver exited with code:", code);
        process.exit(1);
      }
    });
  },

  afterSession: () => {
    closeTauriDriver();
  },

  onComplete: async () => {
    await stopBroker();
    console.log("MQTT broker stopped");

    fs.rmSync(testDataDir, { recursive: true, force: true });
    console.log("Test data dir cleaned up");
  },
};

function closeTauriDriver() {
  exit = true;
  tauriDriver?.kill();
}

function onShutdown(fn: () => void) {
  const cleanup = () => {
    try {
      fn();
    } finally {
      process.exit();
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("SIGHUP", cleanup);
  process.on("SIGBREAK", cleanup);
}

onShutdown(() => {
  closeTauriDriver();
  stopBroker();
});
