import { selectors, waitForDashboard } from "../helpers.js";

describe("Per-Connection Export Button", () => {
  before(async () => {
    await waitForDashboard();
  });

  it("opens the connection dropdown", async () => {
    const switcher = await $(selectors.switcherButton);
    await switcher.click();

    const dropdown = await $(selectors.switcherDropdown);
    await dropdown.waitForExist({ timeout: 3000 });
  });

  it("shows export button on the connection row", async () => {
    const exportBtn = await $('button[title="Export connection"]');
    await exportBtn.waitForExist({ timeout: 3000, timeoutMsg: "Export button not found in dropdown" });
  });

  it("connection dropdown has import option", async () => {
    const importBtn = await $("button*=Import");
    expect(await importBtn.isExisting()).toBe(true);
  });

  it("closes the dropdown", async () => {
    // click outside to close
    await browser.execute(() => {
      document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    await browser.waitUntil(
      async () => !(await $(selectors.switcherDropdown).isExisting()),
      { timeout: 3000 }
    );
  });
});
