import os from "os";
import path from "path";
import fs from "fs";
import {
  selectors,
  waitForDashboard,
  waitForConnectionStatus,
  setInputValue,
  getTextByCss,
  getElText,
} from "../helpers.js";

const dataDir = process.env.MQTT_TOPIC_LAB_DATA_DIR || path.join(os.tmpdir(), "mqtt-topic-lab-e2e");
const dataFile = path.join(dataDir, "data.json");

const FIRST = "E2E Test Connection";
const SECOND = "Second Connection";
const THIRD = "Third Connection";
const OPEN_ELSEWHERE = "Already open";

function savedConnections(): { id: string; client_id: string }[] {
  try {
    return JSON.parse(fs.readFileSync(dataFile, "utf-8")).connections ?? [];
  } catch {
    return [];
  }
}

function savedClientId(id: string): string | undefined {
  return savedConnections().find((c) => c.id === id)?.client_id;
}

async function waitForConnectionName(name: string) {
  await browser.waitUntil(async () => (await getTextByCss(selectors.connectionName)) === name, {
    timeout: 5000,
    timeoutMsg: `window did not show connection "${name}"`,
  });
}

async function openSwitcher() {
  await (await $(selectors.switcherButton)).click();
  await (await $(selectors.switcherDropdown)).waitForExist({ timeout: 3000 });
}

async function switcherRow(name: string) {
  const nameEl = await $(`.connection-option-name=${name}`);
  return (await nameEl.parentElement()).parentElement();
}

async function rowSubtitle(name: string): Promise<string> {
  return getElText(await (await switcherRow(name)).$(".connection-option-broker"));
}

async function openInNewWindow(name: string): Promise<string> {
  const before = await browser.getWindowHandles();
  await openSwitcher();
  await (await (await switcherRow(name)).$("button[title='Open in new window']")).click();
  await browser.waitUntil(
    async () => (await browser.getWindowHandles()).length === before.length + 1,
    { timeout: 5000, timeoutMsg: "no new window appeared" }
  );
  const handle = (await browser.getWindowHandles()).find((h) => !before.includes(h))!;
  await browser.switchToWindow(handle);
  await waitForDashboard();
  return handle;
}

async function deleteActiveConnection() {
  await (await $(selectors.settingsButton)).click();
  await (await $(".modal-small")).waitForExist({ timeout: 3000 });
  await (await $(".btn-danger")).click();
}

async function connectHere() {
  await (await $("button=Connect")).click();
  await waitForConnectionStatus("Connected");
}

async function showPane(pane: string, toggle: string) {
  if (!(await $(pane).isExisting())) {
    await (await $(toggle)).click();
  }
  await (await $(pane)).waitForExist({ timeout: 3000 });
}

async function subscribe(topic: string) {
  await showPane(selectors.messagesPane, selectors.paneToggleMessages);
  await setInputValue(".subscribe-form input", topic);
  await (await $(".subscribe-form .btn")).click();
  await (await $(`.sub-editable=${topic}`)).waitForExist({ timeout: 5000 });
}

async function publish(topic: string, payload: string) {
  await showPane(selectors.publishPane, selectors.paneTogglePublish);
  await setInputValue(selectors.publishTopic, topic);
  await setInputValue(selectors.publishPayload, payload);
  await (await $(selectors.publishButton)).click();
}

async function hasMessage(payload: string): Promise<boolean> {
  for (const el of await $$(selectors.messagePayload)) {
    if ((await getElText(el)) === payload) return true;
  }
  return false;
}

async function waitForMessage(payload: string) {
  await browser.waitUntil(() => hasMessage(payload), {
    timeout: 5000,
    timeoutMsg: `message "${payload}" did not arrive`,
  });
}

describe("Multiple windows", () => {
  let mainWindow: string;
  let secondWindow: string;

  before(async () => {
    await waitForDashboard();
    await waitForConnectionName(FIRST);
    mainWindow = await browser.getWindowHandle();
  });

  it("opens a connection in a new window, giving it a fresh client id when it would clash", async () => {
    expect(savedClientId("e2e-second")).toBe(savedClientId("e2e-default"));

    secondWindow = await openInNewWindow(SECOND);

    await waitForConnectionName(SECOND);
    expect(savedClientId("e2e-default")).toBe("mqtt-topic-lab-e2e");
    expect(savedClientId("e2e-second")).toMatch(/^mqtt-topic-lab-[a-z0-9]{6}$/);
  });

  it("marks a connection open in another window and keeps the own one when it is picked", async () => {
    await openSwitcher();
    expect(await rowSubtitle(FIRST)).toBe(OPEN_ELSEWHERE);
    const firstRow = await switcherRow(FIRST);
    expect(await (await firstRow.$("button[title='Open in new window']")).isExisting()).toBe(false);

    await firstRow.click();

    await (await $(selectors.switcherDropdown)).waitForExist({ reverse: true, timeout: 3000 });
    const switched = await browser
      .waitUntil(async () => (await getTextByCss(selectors.connectionName)) !== SECOND, {
        timeout: 1500,
        interval: 100,
      })
      .catch(() => false);
    expect(switched).toBe(false);
  });

  it("delivers MQTT messages only to the window that subscribed", async () => {
    await connectHere();
    await subscribe("multi/#");

    await browser.switchToWindow(mainWindow);
    await connectHere();
    await subscribe("main/#");
    await publish("multi/test", "for-second");

    await browser.switchToWindow(secondWindow);
    await waitForMessage("for-second");

    await browser.switchToWindow(mainWindow);
    await publish("main/test", "for-main");
    await waitForMessage("for-main");
    expect(await hasMessage("for-second")).toBe(false);
  });

  it("frees a connection when its window switches to another one", async () => {
    await browser.switchToWindow(secondWindow);
    await openSwitcher();
    await (await switcherRow(THIRD)).click();
    await waitForConnectionName(THIRD);

    await browser.switchToWindow(mainWindow);
    await openSwitcher();
    await browser.waitUntil(async () => (await rowSubtitle(SECOND)) === "localhost", {
      timeout: 5000,
      timeoutMsg: "the released connection is still marked as open",
    });
    expect(await rowSubtitle(THIRD)).toBe(OPEN_ELSEWHERE);
    await (await $(selectors.switcherButton)).click();
    await (await $(selectors.switcherDropdown)).waitForExist({ reverse: true, timeout: 3000 });
  });

  it("moves a window to the first free connection when its connection is deleted", async () => {
    await browser.switchToWindow(secondWindow);
    await deleteActiveConnection();

    await waitForConnectionName(SECOND);
    expect(savedConnections().map((c) => c.id)).toEqual(["e2e-default", "e2e-second"]);
  });

  it("shows the connection picker when nothing else is free", async () => {
    await deleteActiveConnection();

    await (await $(".connection-picker")).waitForExist({ timeout: 5000 });
    const options = await $$(".connection-picker-option");
    expect(await options.length).toBe(1);
    expect(await getElText(await options[0].$(".connection-option-name"))).toBe(FIRST);
    expect(await options[0].$(".connection-picker-open").isExisting()).toBe(true);
    expect(savedConnections().map((c) => c.id)).toEqual(["e2e-default"]);
  });
});
