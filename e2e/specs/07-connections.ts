import {
  selectors,
  waitForDashboard,
  setElementValue,
  getTextByCss,
  getElText,
} from "../helpers.js";

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

  it("reorders connections by dragging in the switcher", async () => {
    const switcherBtn = await $(selectors.switcherButton);
    await switcherBtn.click();

    const dropdown = await $(selectors.switcherDropdown);
    await dropdown.waitForExist({ timeout: 3000 });

    const namesBefore = await $$(".connection-option-name");
    expect(await getElText(namesBefore[0])).toBe("E2E Test Connection");
    expect(await getElText(namesBefore[1])).toBe("Second Connection");

    const result = await browser.execute(() => {
      const rows = document.querySelectorAll(".connection-dropdown .connection-option");
      if (rows.length < 2) return { error: "Not enough connections" };

      const sourceRow = rows[1];
      const targetRow = rows[0];
      const handle = sourceRow.querySelector(".connection-drag-handle");
      if (!handle) return { error: "No drag handle found" };

      const reactProps = (el: Element) => {
        const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
        return key ? (el as any)[key] : null;
      };

      const handleProps = reactProps(handle);
      if (!handleProps?.onMouseDown) return { error: "No mousedown handler on drag handle" };
      handleProps.onMouseDown({ preventDefault: () => {}, stopPropagation: () => {} });

      const targetRect = targetRow.getBoundingClientRect();
      setTimeout(() => {
        const targetProps = reactProps(targetRow);
        targetProps?.onMouseEnter?.({
          currentTarget: targetRow,
          clientX: targetRect.left + 10,
          clientY: targetRect.top + 2,
        });

        setTimeout(() => {
          window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        }, 100);
      }, 100);

      return { success: true };
    });
    expect((result as any).error).toBeUndefined();

    await browser.waitUntil(
      async () => {
        const names = await $$(".connection-option-name");
        return (await names.length) >= 2 && (await getElText(names[0])) === "Second Connection";
      },
      { timeout: 5000, timeoutMsg: "Connections were not reordered" }
    );

    const namesAfter = await $$(".connection-option-name");
    expect(await getElText(namesAfter[1])).toBe("E2E Test Connection");

    await switcherBtn.click();
    await dropdown.waitForExist({ timeout: 3000, reverse: true });
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

  it("reveals TLS certificate fields when TLS is enabled", async () => {
    const switcherBtn = await $(selectors.switcherButton);
    await switcherBtn.click();

    const dropdown = await $(selectors.switcherDropdown);
    await dropdown.waitForExist({ timeout: 3000 });

    const addBtn = await $(".connection-option.add-new");
    await addBtn.click();

    const modal = await $(selectors.editorModal);
    await modal.waitForExist({ timeout: 3000 });

    const tlsCheckbox = await modal.$("input[type='checkbox']");
    await tlsCheckbox.click();

    const certLabel = await modal.$("label=Client Certificate");
    await certLabel.waitForExist({ timeout: 3000, timeoutMsg: "TLS cert fields did not appear" });

    const cancelBtn = await $("button=Cancel");
    await cancelBtn.click();
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
