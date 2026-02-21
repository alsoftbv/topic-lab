import { selectors, waitForDashboard, setInputValue } from "../helpers.js";

describe("Button Groups", () => {
  before(async () => {
    await waitForDashboard();
  });

  it("creates a new group", async () => {
    const newGroupBtn = await $(selectors.newGroupArea);
    await newGroupBtn.click();

    await setInputValue(".new-group-input input", "Lights");

    const createBtn = await $(selectors.newGroupCreate);
    await createBtn.click();

    await browser.waitUntil(async () => await $(".button-group-name=Lights").isExisting(), {
      timeout: 5000,
      timeoutMsg: "Group 'Lights' was not created",
    });
  });

  it("collapses and expands a group", async () => {
    const header = await $(".button-group-name=Lights");
    const headerBtn = await header.parentElement();
    await headerBtn.click();

    await browser.pause(300);

    await headerBtn.click();

    await browser.pause(300);
  });

  it("deletes a group", async () => {
    const actionsSpan = await $(".button-group-name=Lights").nextElement();
    const deleteBtn = await actionsSpan.$("button[title='Delete group']");
    await deleteBtn.click();

    await browser.waitUntil(async () => !(await $(".button-group-name=Lights").isExisting()), {
      timeout: 5000,
      timeoutMsg: "Group 'Lights' was not deleted",
    });
  });
});
