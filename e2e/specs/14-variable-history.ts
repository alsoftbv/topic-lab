import {
  selectors,
  waitForDashboard,
  setInputValue,
  getElText,
} from "../helpers.js";

describe("Variable History", () => {
  before(async () => {
    await waitForDashboard();
  });

  it("opens the variables panel and adds a variable", async () => {
    const varsBtn = await $("button*=Variables");
    await varsBtn.click();

    const panel = await $(selectors.variablesPanel);
    await panel.waitForExist({ timeout: 3000 });

    await setInputValue(".add-variable-form input[placeholder='Name']", "mac");
    await setInputValue(".add-variable-form input[placeholder='Value']", "AA:BB:CC");

    const addBtn = await $(".add-variable-form .btn");
    await addBtn.click();

    await browser.waitUntil(async () => await $(".variable-key=mac").isExisting(), {
      timeout: 5000,
      timeoutMsg: "Variable 'mac' was not created",
    });
  });

  it("changes the variable value to create history", async () => {
    const valueEl = await $(".variable-key=mac").parentElement().$(".variable-value-wrapper .variable-value");
    await valueEl.click();
    await browser.pause(300);

    await browser.execute(() => {
      const el = document.querySelector(".variable-value[contenteditable='true']");
      if (el) el.textContent = "11:22:33";
    });

    const saveBtn = await $("button[title='Save']");
    await browser.execute((el: HTMLElement) => {
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    }, saveBtn as unknown as HTMLElement);

    await browser.waitUntil(
      async () => {
        const row = await $(".variable-key=mac").parentElement();
        const value = await row.$(".variable-value-wrapper .variable-value");
        return (await getElText(value)) === "11:22:33";
      },
      { timeout: 5000, timeoutMsg: "Variable was not updated to 11:22:33" }
    );
  });

  it("shows history dropdown with previous value on click", async () => {
    const valueEl = await $(".variable-key=mac").parentElement().$(".variable-value-wrapper .variable-value");
    await valueEl.click();
    await browser.pause(300);

    const dropdown = await $(".variable-history-dropdown");
    await dropdown.waitForExist({ timeout: 3000, timeoutMsg: "History dropdown did not appear" });

    const historyValue = await $(".variable-history-value");
    expect(await getElText(historyValue)).toBe("AA:BB:CC");
  });

  it("selects a history value to switch back", async () => {
    const historyValue = await $(".variable-history-value");
    await browser.execute((el: HTMLElement) => {
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    }, historyValue as unknown as HTMLElement);

    await browser.waitUntil(
      async () => {
        const row = await $(".variable-key=mac").parentElement();
        const value = await row.$(".variable-value-wrapper .variable-value");
        return (await getElText(value)) === "AA:BB:CC";
      },
      { timeout: 5000, timeoutMsg: "Variable was not switched back to AA:BB:CC" }
    );
  });

  it("history now contains the other value", async () => {
    const valueEl = await $(".variable-key=mac").parentElement().$(".variable-value-wrapper .variable-value");
    await valueEl.click();
    await browser.pause(300);

    const dropdown = await $(".variable-history-dropdown");
    await dropdown.waitForExist({ timeout: 3000 });

    const historyValue = await $(".variable-history-value");
    expect(await getElText(historyValue)).toBe("11:22:33");

    // close by clicking elsewhere
    await browser.execute(() => {
      document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    await browser.pause(300);
  });

  it("cleans up: deletes the test variable", async () => {
    // ensure editing is cleared
    await browser.execute(() => {
      (document.activeElement as HTMLElement)?.blur();
    });
    await browser.pause(300);

    const variableRow = await $(".variable-key=mac").parentElement();
    const deleteBtn = await variableRow.$("button[title='Delete']");
    await deleteBtn.waitForExist({ timeout: 3000, timeoutMsg: "Delete button not found" });
    await deleteBtn.click();

    const confirmBtn = await variableRow.$(".variable-delete-yes");
    await confirmBtn.waitForExist({ timeout: 3000 });
    await confirmBtn.click();

    await browser.waitUntil(async () => !(await $(".variable-key=mac").isExisting()), {
      timeout: 5000,
    });

    const varsBtn = await $("button*=Variables");
    await varsBtn.click();
    await browser.pause(300);
  });
});
