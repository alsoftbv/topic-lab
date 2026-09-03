import { selectors, waitForDashboard, setElementValue, getTextByCss } from "../helpers.js";

describe("Connection Management", () => {
  before(async () => {
    await waitForDashboard();
  });

  it("adds a second connection via the switcher", async () => {
    const switcherBtn = await $(selectors.switcherButton);
    await switcherBtn.click();

    const dropdown = await $(selectors.switcherDropdown);
    await dropdown.waitForExist({ timeout: 3000 });

    const addBtn = await $(".connection-option.add-new");
    await addBtn.click();

    const modal = await $(selectors.editorModal);
    await modal.waitForExist({ timeout: 3000 });

    const inputs = await modal.$$("input[type='text']");
    await setElementValue(inputs[0], "Second Connection");
    await setElementValue(inputs[1], "localhost");

    const submitBtn = await $("button=Create Connection");
    await submitBtn.click();

    await browser.waitUntil(
      async () => (await getTextByCss(selectors.connectionName)) === "Second Connection",
      { timeout: 5000, timeoutMsg: "Second connection was not created" }
    );
  });

  it("switches back to the first connection", async () => {
    const switcherBtn = await $(selectors.switcherButton);
    await switcherBtn.click();

    const dropdown = await $(selectors.switcherDropdown);
    await dropdown.waitForExist({ timeout: 3000 });

    const firstOption = await $(".connection-option-name=E2E Test Connection");
    const optionBtn = await firstOption.parentElement();
    await optionBtn.click();

    await browser.waitUntil(
      async () => (await getTextByCss(selectors.connectionName)) === "E2E Test Connection",
      { timeout: 5000, timeoutMsg: "Did not switch to first connection" }
    );
  });

  it("deletes the second connection via settings", async () => {
    const switcherBtn = await $(selectors.switcherButton);
    await switcherBtn.click();

    const dropdown = await $(selectors.switcherDropdown);
    await dropdown.waitForExist({ timeout: 3000 });

    const secondOption = await $(".connection-option-name=Second Connection");
    const optionBtn = await secondOption.parentElement();
    await optionBtn.click();

    await browser.pause(500);

    const settingsBtn = await $(selectors.settingsButton);
    await settingsBtn.click();

    const settingsModal = await $(".modal-small");
    await settingsModal.waitForExist({ timeout: 3000 });

    const deleteBtn = await $(".btn-danger");
    await deleteBtn.click();

    await browser.waitUntil(
      async () => (await getTextByCss(selectors.connectionName)) === "E2E Test Connection",
      { timeout: 5000, timeoutMsg: "Did not fall back to first connection after delete" }
    );
  });

  it("duplicates a connection via the switcher", async () => {
    const switcherBtn = await $(selectors.switcherButton);
    await switcherBtn.click();

    const dropdown = await $(selectors.switcherDropdown);
    await dropdown.waitForExist({ timeout: 3000 });

    const duplicateBtn = await $('button[title="Duplicate connection"]');
    await duplicateBtn.click();

    await browser.waitUntil(
      async () => (await getTextByCss(selectors.connectionName)) === "E2E Test Connection Copy",
      { timeout: 5000, timeoutMsg: "Duplicated connection did not become active" }
    );
  });

  it("deletes the duplicated connection via settings", async () => {
    const settingsBtn = await $(selectors.settingsButton);
    await settingsBtn.click();

    const settingsModal = await $(".modal-small");
    await settingsModal.waitForExist({ timeout: 3000 });

    const deleteBtn = await $(".btn-danger");
    await deleteBtn.click();

    await browser.waitUntil(
      async () => (await getTextByCss(selectors.connectionName)) === "E2E Test Connection",
      { timeout: 5000, timeoutMsg: "Did not fall back to first connection after delete" }
    );
  });
});
