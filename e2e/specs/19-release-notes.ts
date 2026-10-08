import os from "os";
import path from "path";
import fs from "fs";
import { selectors, waitForAppReady, waitForDashboard, getElText } from "../helpers.js";
import { APP_VERSION, RELEASE_NOTE_ITEMS } from "../release-notes.js";

const dataDir = process.env.MQTT_TOPIC_LAB_DATA_DIR || path.join(os.tmpdir(), "mqtt-topic-lab-e2e");
const dataFile = path.join(dataDir, "data.json");

const modalSelector = ".release-notes-modal";

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(dataFile, "utf-8")).settings ?? {};
  } catch {
    return {};
  }
}

function writeSettings(settings: Record<string, unknown>) {
  const data = JSON.parse(fs.readFileSync(dataFile, "utf-8"));
  fs.writeFileSync(dataFile, JSON.stringify({ ...data, settings }));
}

async function waitForModal() {
  await (
    await $(modalSelector)
  ).waitForExist({
    timeout: 5000,
    timeoutMsg: "What's new modal did not appear",
  });
}

async function clickModalButton(label: string) {
  const modal = await $(modalSelector);
  await (await modal.$(`button=${label}`)).click();
}

async function expectModalToStayClosed() {
  const appeared = await browser
    .waitUntil(async () => (await $(modalSelector)).isExisting(), {
      timeout: 1500,
      interval: 100,
    })
    .catch(() => false);
  expect(appeared).toBe(false);
}

async function restartApp() {
  await browser.reloadSession();
  await waitForAppReady();
}

describe("Release notes", () => {
  before(async () => {
    await waitForDashboard();
  });

  it("shows what's new after an update", async () => {
    await waitForModal();

    const title = await getElText(await $(`${modalSelector} h2`));
    expect(title).toBe(`What's new in v${APP_VERSION}`);

    const items = await $$(`${modalSelector} .release-notes-list li`);
    const texts: string[] = [];
    for (const item of items) texts.push(await getElText(item));
    expect(texts).toEqual(RELEASE_NOTE_ITEMS);
  });

  it("Don't show again closes it and turns release notes off", async () => {
    await clickModalButton("Don't show again");

    await (await $(modalSelector)).waitForExist({ reverse: true, timeout: 3000 });
    await browser.waitUntil(
      () =>
        readSettings().lastSeenVersion === APP_VERSION && readSettings().showReleaseNotes === false,
      { timeout: 5000, timeoutMsg: "dismissal was not persisted to data.json" }
    );
  });

  it("stays hidden after a restart", async () => {
    await restartApp();
    await waitForDashboard();
    await expectModalToStayClosed();
  });

  it("stays hidden on the next update while turned off", async () => {
    writeSettings({ lastSeenVersion: "0.0.0", showReleaseNotes: false });
    await restartApp();
    await waitForDashboard();
    await browser.waitUntil(() => readSettings().lastSeenVersion === APP_VERSION, {
      timeout: 5000,
      timeoutMsg: "version was not recorded while release notes were off",
    });
    expect(await (await $(modalSelector)).isExisting()).toBe(false);
  });

  it("OK records the version and keeps release notes on", async () => {
    writeSettings({ lastSeenVersion: "0.0.0" });
    await restartApp();
    await waitForModal();

    await clickModalButton("OK");

    await (await $(modalSelector)).waitForExist({ reverse: true, timeout: 3000 });
    await browser.waitUntil(() => readSettings().lastSeenVersion === APP_VERSION, {
      timeout: 5000,
      timeoutMsg: "OK did not record the version",
    });
    expect(readSettings().showReleaseNotes).toBeUndefined();
  });

  it("stays hidden after OK until the next update", async () => {
    await restartApp();
    await waitForDashboard();
    await expectModalToStayClosed();
  });

  it("is skipped on a fresh install", async () => {
    fs.unlinkSync(dataFile);
    await restartApp();

    await (await $(selectors.wizardTitle)).waitForExist({ timeout: 5000 });
    await browser.waitUntil(() => readSettings().lastSeenVersion === APP_VERSION, {
      timeout: 5000,
      timeoutMsg: "fresh install did not record the version",
    });
    expect(await (await $(modalSelector)).isExisting()).toBe(false);
  });
});
