import {
  selectors,
  waitForDashboard,
  sendShortcut,
  setInputValue,
  getElText,
} from "../helpers.js";

async function getCardDetailValue(card: WebdriverIO.Element, label: string): Promise<string> {
  return await browser.execute(
    (cardEl: HTMLElement, lbl: string) => {
      const rows = cardEl.querySelectorAll(".detail-row");
      for (const row of rows) {
        const labelEl = row.querySelector(".detail-label");
        if (labelEl?.textContent?.includes(lbl)) {
          const value = row.querySelector(".detail-value");
          return value?.textContent?.trim() || "";
        }
      }
      return "";
    },
    card as unknown as HTMLElement,
    label
  );
}

async function findCardByName(name: string): Promise<WebdriverIO.Element | null> {
  const cards = await $$(selectors.buttonCard);
  for (const card of cards) {
    const h3 = await card.$("h3");
    if ((await getElText(h3)) === name) return card;
  }
  return null;
}

describe("Built-in Variables", () => {
  before(async () => {
    await waitForDashboard();
  });

  it("creates a button with {uuid} in payload", async () => {
    await sendShortcut("n", { ctrl: true });

    const modal = await $(selectors.editorModal);
    await modal.waitForExist({ timeout: 3000 });

    await setInputValue("#buttonName", "UUID Test");
    await setInputValue("#topic", "test/builtins");
    await setInputValue("#payload", "id={uuid}");

    const submitBtn = await $("button=Create");
    await submitBtn.click();

    await browser.waitUntil(
      async () => !!(await findCardByName("UUID Test")),
      { timeout: 5000, timeoutMsg: "UUID Test button was not created" }
    );
  });

  it("shows substituted UUID in the payload", async () => {
    const card = await findCardByName("UUID Test");
    expect(card).not.toBeNull();

    const payload = await getCardDetailValue(card!, "Payload");
    expect(payload).toMatch(
      /id=[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/
    );
  });

  it("creates a button with {now:unix} in payload", async () => {
    await sendShortcut("n", { ctrl: true });

    const modal = await $(selectors.editorModal);
    await modal.waitForExist({ timeout: 3000 });

    await setInputValue("#buttonName", "Timestamp Test");
    await setInputValue("#topic", "test/builtins/time");
    await setInputValue("#payload", "ts={now:unix}");

    const submitBtn = await $("button=Create");
    await submitBtn.click();

    await browser.waitUntil(
      async () => !!(await findCardByName("Timestamp Test")),
      { timeout: 5000, timeoutMsg: "Timestamp Test button was not created" }
    );
  });

  it("shows substituted unix timestamp", async () => {
    const card = await findCardByName("Timestamp Test");
    expect(card).not.toBeNull();

    const payload = await getCardDetailValue(card!, "Payload");
    expect(payload).toMatch(/ts=\d{10}/);
  });

  it("creates a button with {random:1-1000} in topic", async () => {
    await sendShortcut("n", { ctrl: true });

    const modal = await $(selectors.editorModal);
    await modal.waitForExist({ timeout: 3000 });

    await setInputValue("#buttonName", "Random Test");
    await setInputValue("#topic", "test/random/{random:1-1000}");

    const submitBtn = await $("button=Create");
    await submitBtn.click();

    await browser.waitUntil(
      async () => !!(await findCardByName("Random Test")),
      { timeout: 5000, timeoutMsg: "Random Test button was not created" }
    );
  });

  it("shows substituted random number in the topic", async () => {
    const card = await findCardByName("Random Test");
    expect(card).not.toBeNull();

    const topic = await getCardDetailValue(card!, "Topic");
    const match = topic.match(/test\/random\/(\d+)/);
    expect(match).not.toBeNull();
    const num = parseInt(match![1]);
    expect(num).toBeGreaterThanOrEqual(1);
    expect(num).toBeLessThanOrEqual(1000);
  });

  it("shows raw templates when variables panel is open", async () => {
    const varsBtn = await $("button*=Variables");
    await varsBtn.click();

    const panel = await $(selectors.variablesPanel);
    await panel.waitForExist({ timeout: 3000 });

    // With panel open, cards show raw templates instead of substituted values
    const card = await findCardByName("UUID Test");
    expect(card).not.toBeNull();

    const payload = await getCardDetailValue(card!, "Payload");
    expect(payload).toBe("id={uuid}");

    // Close variables panel
    await varsBtn.click();
    await browser.pause(300);
  });
});
