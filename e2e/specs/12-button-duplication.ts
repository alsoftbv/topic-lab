import { selectors, waitForDashboard, sendShortcut, sendKey, getElText } from "../helpers.js";

describe("Button Duplication", () => {
  before(async () => {
    await waitForDashboard();
  });

  it("duplicates a button via Ctrl+D", async () => {
    const initialCount = await $$(selectors.buttonCard).length;

    const firstButton = await $(selectors.buttonCard);
    await firstButton.click();
    await browser.pause(200);

    await sendShortcut("d", { ctrl: true });

    await browser.waitUntil(
      async () => (await $$(selectors.buttonCard).length) === initialCount + 1,
      { timeout: 5000, timeoutMsg: "Button was not duplicated" }
    );
  });

  it("duplicated button has the same name as the original", async () => {
    const names = await $$(selectors.buttonName);
    const firstText = await getElText(names[0]);
    const secondText = await getElText(names[1]);
    expect(firstText).toBe(secondText);
  });

  it("rapid Ctrl+D creates multiple distinct buttons", async () => {
    const initialCount = await $$(selectors.buttonCard).length;

    const firstButton = await $(selectors.buttonCard);
    await firstButton.click();
    await browser.pause(200);

    await sendShortcut("d", { ctrl: true });
    await browser.pause(100);
    await sendShortcut("d", { ctrl: true });
    await browser.pause(100);
    await sendShortcut("d", { ctrl: true });

    await browser.waitUntil(
      async () => (await $$(selectors.buttonCard).length) === initialCount + 3,
      { timeout: 5000, timeoutMsg: "Expected more buttons after 3 rapid duplications" }
    );
  });

  it("copy-paste duplicates a button via Ctrl+C then Ctrl+V", async () => {
    const initialCount = await $$(selectors.buttonCard).length;

    const firstButton = await $(selectors.buttonCard);
    await firstButton.click();
    await browser.pause(200);

    await sendShortcut("c", { ctrl: true });
    await browser.pause(100);
    await sendShortcut("v", { ctrl: true });

    await browser.waitUntil(
      async () => (await $$(selectors.buttonCard).length) === initialCount + 1,
      { timeout: 5000, timeoutMsg: "Button was not pasted" }
    );
  });

  it("cleans up duplicated buttons", async () => {
    while ((await $$(selectors.buttonCard).length) > 1) {
      const buttons = await $$(selectors.buttonCard);
      const lastButton = buttons[await buttons.length - 1];
      await lastButton.click();
      await browser.pause(100);
      await sendKey("Backspace");
      await browser.pause(300);
    }

    expect(await $$(selectors.buttonCard).length).toBe(1);
  });
});
