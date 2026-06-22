import os from "os";
import path from "path";
import fs from "fs";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { waitForDashboard } from "../helpers.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const binaryName = process.platform === "win32" ? "mqtt-topic-lab.exe" : "mqtt-topic-lab";
const binaryPath = path.resolve(here, "..", "..", "src-tauri", "target", "debug", binaryName);

function cli(args: string[], dataDir?: string) {
  return spawnSync(binaryPath, args, {
    encoding: "utf-8",
    timeout: 20000,
    env: { ...process.env, ...(dataDir ? { MQTT_TOPIC_LAB_DATA_DIR: dataDir } : {}) },
  });
}

describe("CLI", () => {
  let tmpDir: string;

  before(async () => {
    await waitForDashboard();

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tlab-cli-"));
    fs.writeFileSync(
      path.join(tmpDir, "data.json"),
      JSON.stringify({
        connections: [
          {
            id: "c1",
            name: "cli",
            broker_url: "localhost",
            port: 1883,
            client_id: "mqtt-topic-lab-cli-e2e",
            use_tls: false,
            auto_connect: false,
            variables: { device_id: "sensor-1" },
            variable_history: {},
            buttons: [
              {
                id: "b1",
                name: "Ping",
                topic: "e2e/cli/ping",
                payload: "pong",
                qos: "atmostonce",
                retain: false,
              },
            ],
            groups: [],
            subscriptions: [],
          },
          {
            id: "c2",
            name: "cli2",
            broker_url: "localhost",
            port: 1883,
            client_id: "mqtt-topic-lab-cli2-e2e",
            use_tls: false,
            auto_connect: false,
            variables: {},
            variable_history: {},
            buttons: [],
            groups: [],
            subscriptions: [],
          },
        ],
        last_connection_id: "c1",
      })
    );
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("lists connections from the running app's data dir (read)", () => {
    const r = cli(["connections", "list", "--json"]);
    expect(r.status).toBe(0);
    const conns = JSON.parse(r.stdout);
    expect(conns.some((c: any) => c.name === "E2E Test Connection")).toBe(true);
  });

  it("selects the active connection (write to a free data dir)", () => {
    let r = cli(["connections", "select", "cli2"], tmpDir);
    expect(r.status).toBe(0);
    r = cli(["connections", "list", "--json"], tmpDir);
    expect(r.status).toBe(0);
    const active = JSON.parse(r.stdout).find((c: any) => c.active);
    expect(active.name).toBe("cli2");
  });

  it("refuses selecting a connection while the app is running (instance lock)", () => {
    const r = cli(["connections", "select", "E2E Test Connection"]);
    expect(r.status).not.toBe(0);
    expect((r.stderr || "").toLowerCase()).toContain("is open");
  });

  it("lists buttons (read)", () => {
    const r = cli(["buttons", "list", "--json"]);
    expect(r.status).toBe(0);
    const btns = JSON.parse(r.stdout);
    expect(btns.some((b: any) => b.name === "Test Button" && b.topic === "test/e2e")).toBe(true);
  });

  it("prints the embedded agent skill", () => {
    const r = cli(["skill"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("MQTT Topic Lab CLI");
    expect(r.stdout).toContain("name: topic-lab");
  });

  it("refuses config writes while the app is running (instance lock)", () => {
    const r = cli(["buttons", "add", "-n", "ShouldNotExist", "-t", "x"]);
    expect(r.status).not.toBe(0);
    expect((r.stderr || "").toLowerCase()).toContain("is open");
  });

  it("adds, edits, and deletes a button against a free data dir (write)", () => {
    let r = cli(["buttons", "add", "-n", "Created", "-t", "topic/created", "-p", "x", "--qos", "2"], tmpDir);
    expect(r.status).toBe(0);

    r = cli(["buttons", "list", "--json"], tmpDir);
    expect(JSON.parse(r.stdout).some((b: any) => b.name === "Created" && b.qos === "exactlyonce")).toBe(true);

    r = cli(["buttons", "edit", "Created", "--payload", "y", "--retain", "true"], tmpDir);
    expect(r.status).toBe(0);
    r = cli(["buttons", "list", "--json"], tmpDir);
    const created = JSON.parse(r.stdout).find((b: any) => b.name === "Created");
    expect(created.payload).toBe("y");
    expect(created.retain).toBe(true);

    r = cli(["buttons", "delete", "Created"], tmpDir);
    expect(r.status).toBe(0);
    r = cli(["buttons", "list", "--json"], tmpDir);
    expect(JSON.parse(r.stdout).some((b: any) => b.name === "Created")).toBe(false);
  });

  it("lists variables (read)", () => {
    const r = cli(["variables", "list", "-c", "cli", "--json"], tmpDir);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ device_id: "sensor-1" });
  });

  it("refuses setting a variable while the app is running (instance lock)", () => {
    const r = cli(["variables", "set", "device_id", "nope"]);
    expect(r.status).not.toBe(0);
    expect((r.stderr || "").toLowerCase()).toContain("is open");
  });

  it("sets, records history for, and unsets a variable (write)", () => {
    let r = cli(["variables", "set", "device_id", "sensor-2", "-c", "cli"], tmpDir);
    expect(r.status).toBe(0);
    r = cli(["variables", "set", "region", "eu", "-c", "cli"], tmpDir);
    expect(r.status).toBe(0);

    r = cli(["variables", "list", "-c", "cli", "--json"], tmpDir);
    expect(JSON.parse(r.stdout)).toEqual({ device_id: "sensor-2", region: "eu" });

    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, "data.json"), "utf-8"));
    const conn = data.connections.find((c: any) => c.id === "c1");
    expect(conn.variable_history.device_id).toEqual(["sensor-1"]);

    r = cli(["variables", "unset", "region", "-c", "cli"], tmpDir);
    expect(r.status).toBe(0);

    cli(["variables", "set", "device_id", "sensor-1", "-c", "cli"], tmpDir);
    r = cli(["variables", "list", "-c", "cli", "--json"], tmpDir);
    expect(JSON.parse(r.stdout)).toEqual({ device_id: "sensor-1" });
  });

  it("fails to unset a missing variable", () => {
    const r = cli(["variables", "unset", "does_not_exist", "-c", "cli"], tmpDir);
    expect(r.status).not.toBe(0);
  });

  it("rejects an out-of-range qos", () => {
    const r = cli(["publish", "-c", "cli", "-t", "x", "--qos", "5"], tmpDir);
    expect(r.status).not.toBe(0);
  });

  it("publishes a retained message a subscriber then receives (broker round trip)", () => {
    const pub = cli(
      ["publish", "-c", "cli", "-t", "e2e/cli/rt", "-p", "hello-cli", "--retain", "--qos", "1"],
      tmpDir
    );
    expect(pub.status).toBe(0);
    const sub = cli(["subscribe", "-c", "cli", "-t", "e2e/cli/rt", "-n", "1", "--timeout", "10", "--json"], tmpDir);
    expect(sub.status).toBe(0);
    expect(sub.stdout).toContain("hello-cli");
  });

  it("substitutes variables when publishing", () => {
    const pub = cli(
      ["publish", "-c", "cli", "-t", "e2e/cli/dev/{device_id}", "-p", "v", "--retain", "--qos", "1"],
      tmpDir
    );
    expect(pub.status).toBe(0);
    const sub = cli(
      ["subscribe", "-c", "cli", "-t", "e2e/cli/dev/#", "-n", "1", "--timeout", "10", "--json"],
      tmpDir
    );
    expect(sub.status).toBe(0);
    expect(sub.stdout).toContain("e2e/cli/dev/sensor-1");
  });

  it("installs onto a directory and runs through the created symlink", () => {
    const binDir = path.join(tmpDir, "bin");
    const r = cli(["install", "--path", binDir, "--json"]);
    expect(r.status).toBe(0);
    const link = path.join(binDir, "topic-lab");
    expect(fs.existsSync(link)).toBe(true);

    const viaLink = spawnSync(link, ["connections", "list", "--json"], {
      encoding: "utf-8",
      timeout: 20000,
      env: { ...process.env, MQTT_TOPIC_LAB_DATA_DIR: tmpDir },
    });
    expect(viaLink.status).toBe(0);
    expect(JSON.parse(viaLink.stdout).some((c: any) => c.name === "cli")).toBe(true);
  });
});
