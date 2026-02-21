import { selectors, waitForAppReady, setInputValue, getTextByCss } from "../helpers.js";

describe("Setup Wizard", () => {
  before(async () => {
    await waitForAppReady();
  });

  it("shows the setup wizard", async () => {
    const title = await $(selectors.wizardTitle);
    expect(await title.getText()).toBe("MQTT Topic Lab");
  });

  it("has default connection name", async () => {
    const nameInput = await $(selectors.wizardNameInput);
    expect(await nameInput.getValue()).toBe("My Connection");
  });

  it("can set the connection name via execute", async () => {
    await setInputValue("#name", "E2E Test Connection");
    const nameInput = await $(selectors.wizardNameInput);
    expect(await nameInput.getValue()).toBe("E2E Test Connection");
  });

  it("can set the broker URL", async () => {
    await setInputValue("#brokerUrl", "localhost");
    const brokerInput = await $(selectors.wizardBrokerInput);
    expect(await brokerInput.getValue()).toBe("localhost");
  });

  it("proceeds to step 2", async () => {
    const nextButton = await $("button=Next: Authentication");
    await nextButton.click();

    const heading = await $("h2=Authentication (Optional)");
    await heading.waitForExist({ timeout: 3000 });
  });

  it("unchecks auto-connect and submits", async () => {
    const autoConnectCheckbox = await $("label=Auto-connect when selected");
    await autoConnectCheckbox.click();

    const submitButton = await $("button=Create Connection");
    await submitButton.click();

    await browser.waitUntil(async () => await $(selectors.dashboard).isExisting(), {
      timeout: 10000,
      timeoutMsg: "Dashboard did not appear",
    });
  });

  it("shows the connection name on the dashboard", async () => {
    await browser.waitUntil(
      async () => (await getTextByCss(selectors.connectionName)) === "E2E Test Connection",
      { timeout: 10000, timeoutMsg: "Connection name did not appear on dashboard" }
    );
  });
});
