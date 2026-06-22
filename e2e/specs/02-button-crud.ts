import {
  selectors,
  waitForDashboard,
  sendShortcut,
  openButtonEditor,
  editSelectedButton,
  sendKey,
  setInputValue,
  getElText,
} from "../helpers.js";

describe("Button CRUD", () => {
  before(async () => {
    await waitForDashboard();
  });

  it("creates a new button via Ctrl+N", async () => {
    await openButtonEditor();

    await setInputValue("#buttonName", "Test Button 1");
    await setInputValue("#topic", "test/topic/1");
    await setInputValue("#payload", '{"action": "ON"}');

    const submitBtn = await $("button=Create");
    await submitBtn.click();

    await browser.waitUntil(
      async () => {
        const cards = await $$(selectors.buttonName);
        for (const card of cards) {
          if ((await getElText(card)) === "Test Button 1") return true;
        }
        return false;
      },
      { timeout: 5000, timeoutMsg: "Button 'Test Button 1' was not created" }
    );
  });

  it("creates a second button", async () => {
    await openButtonEditor();

    await setInputValue("#buttonName", "Test Button 2");
    await setInputValue("#topic", "test/topic/2");
    await setInputValue("#payload", "hello");

    const submitBtn = await $("button=Create");
    await submitBtn.click();

    await browser.waitUntil(
      async () => {
        const cards = await $$(selectors.buttonName);
        for (const card of cards) {
          if ((await getElText(card)) === "Test Button 2") return true;
        }
        return false;
      },
      { timeout: 5000, timeoutMsg: "Button 'Test Button 2' was not created" }
    );
  });

  it("edits a button via Ctrl+E", async () => {
    const firstButton = await $(selectors.buttonCard);
    await firstButton.click();

    await editSelectedButton();

    await setInputValue("#buttonName", "Renamed Button");

    const submitBtn = await $("button=Update");
    await submitBtn.click();

    await browser.waitUntil(
      async () => {
        const cards = await $$(selectors.buttonName);
        for (const card of cards) {
          if ((await getElText(card)) === "Renamed Button") return true;
        }
        return false;
      },
      { timeout: 5000, timeoutMsg: "Button was not renamed" }
    );
  });

  it("duplicates a button via Ctrl+D", async () => {
    const initialCount = await $$(selectors.buttonCard).length;

    await sendKey("Escape");
    await browser.pause(200);

    const firstButton = await $(selectors.buttonCard);
    await firstButton.click();

    await sendShortcut("d", { ctrl: true });

    await browser.waitUntil(
      async () => (await $$(selectors.buttonCard).length) === initialCount + 1,
      { timeout: 5000, timeoutMsg: "Button was not duplicated" }
    );
  });

  it("deletes a button via Backspace", async () => {
    const initialCount = await $$(selectors.buttonCard).length;

    const buttons = await $$(selectors.buttonCard);
    const lastButton = buttons[await buttons.length - 1];
    await lastButton.click();

    await sendKey("Backspace");

    await browser.waitUntil(
      async () => (await $$(selectors.buttonCard).length) === initialCount - 1,
      { timeout: 5000, timeoutMsg: "Button was not deleted" }
    );
  });
});
