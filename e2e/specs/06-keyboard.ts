import { selectors, waitForDashboard, sendShortcut, sendKey } from "../helpers.js";

describe("Keyboard Shortcuts", () => {
  before(async () => {
    await waitForDashboard();
  });

  it("Ctrl+N opens the new button editor", async () => {
    await sendShortcut("n", { ctrl: true });

    const modal = await $(selectors.editorModal);
    await modal.waitForExist({ timeout: 3000 });

    await sendKey("Escape");
    await browser.pause(300);

    expect(await $(selectors.editorModal).isExisting()).toBe(false);
  });

  it("Arrow keys navigate between buttons", async () => {
    await sendKey("ArrowDown");
    await browser.pause(200);

    const selected = await $(".button-card.selected");
    expect(await selected.isExisting()).toBe(true);

    await sendKey("ArrowRight");
    await browser.pause(200);
  });

  it("Escape deselects", async () => {
    await sendKey("Escape");
    await browser.pause(200);

    const selected = await $(".button-card.selected");
    expect(await selected.isExisting()).toBe(false);
  });

  it("Ctrl+I toggles message viewer", async () => {
    const initiallyVisible = await $(selectors.messageViewerContent).isExisting();

    await sendShortcut("i", { ctrl: true });
    await browser.pause(300);

    const afterToggle = await $(selectors.messageViewerContent).isExisting();
    expect(afterToggle).not.toBe(initiallyVisible);

    // Toggle back
    await sendShortcut("i", { ctrl: true });
    await browser.pause(300);
  });
});
