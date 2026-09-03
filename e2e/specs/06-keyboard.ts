import {
  selectors,
  waitForDashboard,
  sendShortcut,
  openButtonEditor,
  sendKey,
} from "../helpers.js";

describe("Keyboard Shortcuts", () => {
  before(async () => {
    await waitForDashboard();
  });

  it("Ctrl+N opens the new button editor", async () => {
    await browser.pause(500);
    await openButtonEditor();

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

  it("Ctrl+I toggles the messages pane", async () => {
    const initiallyVisible = await $(selectors.messagesPane).isExisting();

    await sendShortcut("i", { ctrl: true });
    await browser.pause(300);

    const afterToggle = await $(selectors.messagesPane).isExisting();
    expect(afterToggle).not.toBe(initiallyVisible);

    // Toggle back
    await sendShortcut("i", { ctrl: true });
    await browser.pause(300);
  });

  it("Ctrl+P toggles the publish pane", async () => {
    const initiallyVisible = await $(selectors.publishPane).isExisting();

    await sendShortcut("p", { ctrl: true });
    await browser.pause(300);

    const afterToggle = await $(selectors.publishPane).isExisting();
    expect(afterToggle).not.toBe(initiallyVisible);

    // Toggle back
    await sendShortcut("p", { ctrl: true });
    await browser.pause(300);
  });
});
