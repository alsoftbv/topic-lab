import {
  selectors,
  waitForDashboard,
  waitForConnectionStatus,
  setInputValue,
  openButtonEditor,
} from "./helpers.js";

const OUT = "/app/e2e/screens";

async function captureWithHandles(name: string) {
  await browser.saveScreenshot(`${OUT}/${name}.png`);
  await browser.execute(() => {
    document
      .querySelectorAll<HTMLElement>(".dock-splitter, .dock-resize-handle")
      .forEach((el) => (el.style.background = "var(--primary)"));
  });
  await browser.pause(200);
  await browser.saveScreenshot(`${OUT}/${name}-handles.png`);
}

async function clickIfPresent(selector: string) {
  const el = await $(selector);
  if (await el.isExisting()) await el.click();
}

async function showPane(pane: string) {
  if (!(await $(`.${pane}-pane`).isExisting())) {
    await (await $(`.pane-toggles button[data-pane='${pane}']`)).click();
  }
}

async function ensureConnected() {
  const notNow = await $("button=Not now");
  if (await notNow.waitForExist({ timeout: 1500 }).catch(() => false)) {
    await notNow.click();
  }
  await clickIfPresent("button=Connect");
  await waitForConnectionStatus("Connected");
}

async function createButton(name: string, topic: string, payload: string) {
  await openButtonEditor();
  await setInputValue(selectors.editorNameInput, name);
  await setInputValue(selectors.editorTopicInput, topic);
  await setInputValue(selectors.editorPayloadTextarea, payload);
  await (await $("button=Create")).click();
  await browser.pause(300);
}

describe("Screens", () => {
  before(async () => {
    await waitForDashboard();
  });

  it("captures the dashboard in every dock position", async () => {
    await ensureConnected();
    await showPane("messages");
    await showPane("publish");

    if ((await $$(selectors.buttonCard).length) < 3) {
      await createButton("Reboot", "devices/{device}/cmd", '{"action": "reboot"}');
      await createButton("Firmware Update", "devices/{device}/ota", '{"version": "2.1.0"}');
      await createButton("Ping", "devices/{device}/ping", "");
    }

    if (!(await $(".sub-editable=test/#").isExisting())) {
      await setInputValue(".subscribe-form input", "test/#");
      await (await $(".subscribe-form .btn")).click();
      await browser.pause(300);
    }

    await setInputValue(selectors.publishTopic, "test/screens/device-01");
    await setInputValue(selectors.publishPayload, '{"hello": "world", "count": 1}');
    for (let i = 0; i < 6; i++) {
      await (await $(selectors.publishButton)).click();
      await browser.pause(150);
    }
    await browser.pause(600);
    await (await $(".pane-toggles button[data-pane='commands']")).click();
    await browser.pause(400);
    await browser.saveScreenshot(`${OUT}/fill.png`);
    await (await $(".pane-toggles button[data-pane='commands']")).click();
    await browser.pause(300);

    await captureWithHandles("top");

    for (const pos of ["right", "left"]) {
      await clickIfPresent("button=Disconnect");
      await waitForConnectionStatus("Disconnected");
      await browser.execute((p: string) => localStorage.setItem("dockPosition", p), pos);
      await browser.refresh();
      await waitForDashboard();
      await ensureConnected();
      await browser.pause(800);
      await captureWithHandles(pos);
    }
    await browser.execute(() => localStorage.setItem("dockPosition", "top"));
  });
});
