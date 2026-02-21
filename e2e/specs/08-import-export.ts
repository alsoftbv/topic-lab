import { selectors, waitForDashboard, getElText, getTextByCss } from "../helpers.js";

describe("Import & Export", () => {
  before(async () => {
    await waitForDashboard();
  });

  it("has an export button in settings modal", async () => {
    const settingsBtn = await $(selectors.settingsButton);
    await settingsBtn.click();

    const modal = await $(".modal-small");
    await modal.waitForExist({ timeout: 3000 });

    const exportBtn = await $("button=Export Connection");
    expect(await exportBtn.isExisting()).toBe(true);

    // Close modal via overlay click
    await browser.execute(() => {
      const overlay = document.querySelector(".modal-overlay");
      if (overlay) (overlay as HTMLElement).dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    await browser.pause(300);
  });

  it("has an import button in connection switcher", async () => {
    const switcherBtn = await $(selectors.switcherButton);
    await switcherBtn.click();

    const dropdown = await $(selectors.switcherDropdown);
    await dropdown.waitForExist({ timeout: 3000 });

    const addNewBtns = await $$(".connection-option.add-new");
    const btnCount = await addNewBtns.length;

    let importFound = false;
    for (let i = 0; i < btnCount; i++) {
      const text = await getElText(addNewBtns[i]);
      if (text.includes("Import")) {
        importFound = true;
        break;
      }
    }
    expect(importFound).toBe(true);

    // Close dropdown
    await browser.execute(() => document.body.click());
    await browser.pause(300);
  });

  it("settings modal shows connection details", async () => {
    const settingsBtn = await $(selectors.settingsButton);
    await settingsBtn.click();

    const modal = await $(".modal-small");
    await modal.waitForExist({ timeout: 3000 });

    // Verify the settings modal shows the connection info
    const modalText = await browser.execute(() => {
      const modal = document.querySelector(".modal-small");
      return modal?.textContent || "";
    });

    expect(modalText).toContain("localhost");
    expect(modalText).toContain("Export Connection");
    expect(modalText).toContain("Delete Connection");

    // Close modal
    await browser.execute(() => {
      const overlay = document.querySelector(".modal-overlay");
      if (overlay) (overlay as HTMLElement).dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    await browser.pause(300);
  });
});
