import os from "os";
import path from "path";
import fs from "fs";
import { selectors, waitForDashboard, setInputValue, openButtonEditor } from "../helpers.js";

const dataDir =
  process.env.MQTT_TOPIC_LAB_DATA_DIR || path.join(os.tmpdir(), "mqtt-topic-lab-e2e");
const dataFile = path.join(dataDir, "data.json");

function diskHasVariable(key: string, value: string): boolean {
  try {
    const data = JSON.parse(fs.readFileSync(dataFile, "utf-8"));
    return (data.connections || []).some(
      (c: any) => c.variables && c.variables[key] === value
    );
  } catch {
    return false;
  }
}

describe("Persistence", () => {
  before(async () => {
    await waitForDashboard();
  });

  it("persists a variable change to data.json while the live-preview timer runs", async () => {
    await openButtonEditor();
    await setInputValue("#buttonName", "Builtin Timer");
    await setInputValue("#topic", "logs/{now:unix}");
    await (await $("button=Create")).click();
    await browser.waitUntil(async () => (await $$(selectors.buttonCard).length) > 0, {
      timeout: 5000,
      timeoutMsg: "built-in button was not created",
    });

    const varsBtn = await $("button*=Variables");
    await varsBtn.click();
    const panel = await $(selectors.variablesPanel);
    await panel.waitForExist({ timeout: 3000 });
    await setInputValue(".add-variable-form input[placeholder='Name']", "persist_key");
    await setInputValue(".add-variable-form input[placeholder='Value']", "persist_value");
    await (await $(".add-variable-form .btn")).click();

    await browser.waitUntil(async () => await $(".variable-key=persist_key").isExisting(), {
      timeout: 5000,
      timeoutMsg: "Variable 'persist_key' was not added to the UI",
    });

    await browser.waitUntil(() => diskHasVariable("persist_key", "persist_value"), {
      timeout: 6000,
      timeoutMsg: "variable change was not persisted to data.json (save did not reach disk)",
    });
  });
});
