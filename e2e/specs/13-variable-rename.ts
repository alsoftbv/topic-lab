import {
  selectors,
  waitForDashboard,
  sendShortcut,
  sendKey,
  setInputValue,
  getElText,
} from "../helpers.js";

describe("Variable Rename", () => {
  before(async () => {
    await waitForDashboard();
  });

  it("opens the variables panel and adds a variable", async () => {
    const varsBtn = await $("button*=Variables");
    await varsBtn.click();

    const panel = await $(selectors.variablesPanel);
    await panel.waitForExist({ timeout: 3000 });

    await setInputValue(".add-variable-form input[placeholder='name']", "old_name");
    await setInputValue(".add-variable-form input[placeholder='Value']", "test_value");

    const addBtn = await $(".add-variable-form .btn");
    await addBtn.click();

    await browser.waitUntil(async () => await $(".variable-key=old_name").isExisting(), {
      timeout: 5000,
      timeoutMsg: "Variable 'old_name' was not created",
    });
  });

  it("creates a button using the variable in topic", async () => {
    await sendShortcut("n", { ctrl: true });

    const modal = await $(selectors.editorModal);
    await modal.waitForExist({ timeout: 3000 });

    await setInputValue("#buttonName", "Rename Test");
    await setInputValue("#topic", "devices/{old_name}/status");
    await setInputValue("#payload", "val={old_name}");

    const submitBtn = await $("button=Create");
    await submitBtn.click();
    await browser.pause(500);
  });

  it("renames the variable key inline", async () => {
    const keyEl = await $(".variable-key=old_name");
    await keyEl.click();
    await browser.pause(300);

    await browser.execute(() => {
      const el = document.querySelector(".variable-key[contenteditable='true']");
      if (el) el.textContent = "new_name";
    });

    const editableEl = await $(".variable-key[contenteditable='true']");
    await editableEl.addValue("\uE007");

    await browser.waitUntil(async () => await $(".variable-key=new_name").isExisting(), {
      timeout: 5000,
      timeoutMsg: "Variable key was not renamed to 'new_name'",
    });

    expect(await $(".variable-key=old_name").isExisting()).toBe(false);
  });

  it("updated button references from {old_name} to {new_name}", async () => {
    const varsBtn = await $("button*=Variables");
    await varsBtn.click();

    await browser.waitUntil(
      async () => !(await $(selectors.variablesPanel).isExisting()),
      { timeout: 3000, timeoutMsg: "Variables panel did not close" }
    );

    await browser.pause(500);

    const buttons = await $$(selectors.buttonCard);
    let renameTestBtn: WebdriverIO.Element | null = null;
    for (const btn of buttons) {
      const name = await getElText(await btn.$("h3"));
      if (name === "Rename Test") {
        renameTestBtn = btn;
        break;
      }
    }
    expect(renameTestBtn).not.toBeNull();

    await browser.execute((el: HTMLElement) => el.click(), renameTestBtn! as unknown as HTMLElement);
    await browser.pause(300);

    await browser.waitUntil(
      async () => {
        const selected = await $(".button-card.selected");
        return await selected.isExisting();
      },
      { timeout: 3000, timeoutMsg: "Button was not selected" }
    );

    await sendShortcut("e", { ctrl: true });

    const modal = await $(selectors.editorModal);
    await modal.waitForExist({ timeout: 5000 });

    const topicValue = await browser.execute(() => {
      const el = document.querySelector("#topic") as HTMLInputElement;
      return el?.value || "";
    });
    expect(topicValue).toBe("devices/{new_name}/status");

    const payloadValue = await browser.execute(() => {
      const el = document.querySelector("#payload") as HTMLTextAreaElement;
      return el?.value || "";
    });
    expect(payloadValue).toBe("val={new_name}");

    const cancelBtn = await $("button=Cancel");
    await cancelBtn.click();
    await browser.pause(300);
  });

  it("cleans up: deletes the test button and variable", async () => {
    const buttons = await $$(selectors.buttonCard);
    const lastButton = buttons[await buttons.length - 1];
    await lastButton.click();
    await browser.pause(100);

    await sendKey("Backspace");
    await browser.pause(300);

    const varsBtn = await $("button*=Variables");
    await varsBtn.click();

    const panel = await $(selectors.variablesPanel);
    await panel.waitForExist({ timeout: 3000 });

    const variableRow = await $(".variable-key=new_name").parentElement();
    const deleteBtn = await variableRow.$("button[title='Delete']");
    await deleteBtn.click();

    await browser.waitUntil(async () => !(await $(".variable-key=new_name").isExisting()), {
      timeout: 5000,
    });

    const varsBtn2 = await $("button*=Variables");
    await varsBtn2.click();
    await browser.pause(300);
  });
});
