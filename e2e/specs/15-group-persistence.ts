import {
  selectors,
  waitForDashboard,
  sendShortcut,
  sendKey,
  setInputValue,
  getElText,
} from "../helpers.js";

describe("Group Persistence After Duplication", () => {
  before(async () => {
    await waitForDashboard();
  });

  it("creates a new empty group", async () => {
    const newGroupBtn = await $(selectors.newGroupArea);
    await newGroupBtn.click();

    await setInputValue(".new-group-input input", "Persist Test");

    const createBtn = await $(selectors.newGroupCreate);
    await createBtn.click();

    await browser.waitUntil(async () => await $(".button-group-name=Persist Test").isExisting(), {
      timeout: 5000,
      timeoutMsg: "Group 'Persist Test' was not created",
    });
  });

  it("duplicates a button in the ungrouped section", async () => {
    const initialCount = await $$(selectors.buttonCard).length;
    const buttons = await $$(selectors.buttonCard);

    const firstButton = buttons[0];
    await browser.execute((el: HTMLElement) => el.click(), firstButton as unknown as HTMLElement);
    await browser.pause(200);

    await sendShortcut("d", { ctrl: true });

    await browser.waitUntil(
      async () => (await $$(selectors.buttonCard).length) === initialCount + 1,
      { timeout: 5000, timeoutMsg: "Button was not duplicated" }
    );
  });

  it("empty group still exists after duplication", async () => {
    const groupExists = await $(".button-group-name=Persist Test").isExisting();
    expect(groupExists).toBe(true);
  });

  it("cleans up: deletes the duplicated button and the group", async () => {
    const count = await $$(selectors.buttonCard).length;
    const buttons = await $$(selectors.buttonCard);
    const lastButton = buttons[count - 1];
    await browser.execute((el: HTMLElement) => el.click(), lastButton as unknown as HTMLElement);
    await browser.pause(100);

    await sendKey("Backspace");
    await browser.pause(500);

    const actionsSpan = await $(".button-group-name=Persist Test").nextElement();
    const deleteBtn = await actionsSpan.$("button[title='Delete group']");
    await deleteBtn.click();

    await browser.waitUntil(
      async () => !(await $(".button-group-name=Persist Test").isExisting()),
      { timeout: 5000 }
    );
  });
});
