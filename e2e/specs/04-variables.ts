import { selectors, waitForDashboard, openButtonEditor, setInputValue, getElText } from "../helpers.js";

describe("Variables", () => {
  before(async () => {
    await waitForDashboard();
  });

  it("opens the variables panel", async () => {
    const varsBtn = await $("button*=Variables");
    await varsBtn.click();

    const panel = await $(selectors.variablesPanel);
    await panel.waitForExist({ timeout: 3000 });
  });

  it("adds a custom variable", async () => {
    await setInputValue(".add-variable-form input[placeholder='Name']", "device_id");
    await setInputValue(".add-variable-form input[placeholder='Value']", "sensor-001");

    const addBtn = await $(".add-variable-form .btn");
    await addBtn.click();

    await browser.waitUntil(async () => await $(".variable-key=device_id").isExisting(), {
      timeout: 5000,
      timeoutMsg: "Variable 'device_id' was not created",
    });
  });

  it("creates a button using the variable and verifies substitution", async () => {
    await openButtonEditor();

    await setInputValue("#buttonName", "Variable Test");
    await setInputValue("#topic", "devices/{device_id}/cmd");

    await browser.waitUntil(
      async () => {
        const preview = await $(".preview code");
        return (await preview.isExisting()) && (await getElText(preview)).includes("sensor-001");
      },
      { timeout: 5000, timeoutMsg: "Topic preview did not resolve {device_id} to sensor-001" }
    );

    const submitBtn = await $("button=Create");
    await submitBtn.click();

    await browser.pause(500);
  });

  it("edits a variable value inline", async () => {
    const valueEl = await $(".variable-key=device_id").parentElement().$(selectors.variableValue);
    await valueEl.click();

    await browser.pause(300);

    await browser.execute((sel: string) => {
      const el = document.querySelector(`${sel}[contenteditable="true"]`);
      if (el) el.textContent = "sensor-002";
    }, selectors.variableValue);

    const saveBtn = await $("button[title='Save']");
    await browser.execute((el: HTMLElement) => {
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    }, saveBtn as unknown as HTMLElement);

    await browser.waitUntil(
      async () => {
        const row = await $(".variable-key=device_id");
        if (!(await row.isExisting())) return false;
        const parent = await row.parentElement();
        const value = await parent.$(selectors.variableValue);
        if (!(await value.isExisting())) return false;
        return (await getElText(value)) === "sensor-002";
      },
      { timeout: 5000, timeoutMsg: "Variable value was not updated to sensor-002" }
    );
  });

  it("deletes a variable", async () => {
    const variableRow = await $(".variable-key=device_id").parentElement();
    const deleteBtn = await variableRow.$("button[title='Delete']");
    await deleteBtn.click();

    await browser.waitUntil(async () => !(await $(".variable-key=device_id").isExisting()), {
      timeout: 5000,
      timeoutMsg: "Variable 'device_id' was not deleted",
    });
  });

  it("closes the variables panel", async () => {
    const varsBtn = await $("button*=Variables");
    await varsBtn.click();

    await browser.pause(300);
  });
});
