import {
  selectors,
  waitForDashboard,
  waitForConnectionStatus,
  openButtonEditor,
  setInputValue,
  getElText,
} from "../helpers.js";

describe("Multi-Send Mode", () => {
  before(async () => {
    await waitForDashboard();
  });

  it("connects to the broker", async () => {
    const connectBtn = await $("button=Connect");
    if (await connectBtn.isExisting()) {
      await connectBtn.click();
    }
    await waitForConnectionStatus("Connected");
  });

  it("creates a multi-send button", async () => {
    await openButtonEditor();

    await setInputValue("#buttonName", "Multi Send Test");
    await setInputValue("#topic", "test/multi");
    await setInputValue("#payload", "ping");

    // Enable multi-send checkbox
    await browser.execute(() => {
      const checkboxes = document.querySelectorAll<HTMLInputElement>(
        ".label-with-checkbox input[type='checkbox']"
      );
      for (const cb of checkboxes) {
        const label = cb.parentElement?.querySelector("label");
        if (label?.textContent?.includes("Multi-send")) {
          const proto = HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, "checked")!.set!.call(cb, true);
          cb.dispatchEvent(new Event("change", { bubbles: true }));
          const propsKey = Object.keys(cb).find((k) => k.startsWith("__reactProps$"));
          if (propsKey) {
            (cb as any)[propsKey].onChange?.({ target: cb, currentTarget: cb });
          }
          break;
        }
      }
    });

    await browser.pause(200);

    const submitBtn = await $("button=Create");
    await submitBtn.click();

    await browser.waitUntil(
      async () => {
        const cards = await $$(selectors.buttonName);
        for (const card of cards) {
          if ((await getElText(card)) === "Multi Send Test") return true;
        }
        return false;
      },
      { timeout: 5000, timeoutMsg: "Multi-send button was not created" }
    );
  });

  it("shows a multi-send interval badge on the card", async () => {
    // The badge contains a Repeat icon + interval text (e.g. "1s")
    const hasBadge = await browser.execute(() => {
      const cards = document.querySelectorAll(".button-card");
      const last = cards[cards.length - 1];
      if (!last) return false;
      const badges = last.querySelectorAll(".badge");
      for (const badge of badges) {
        // Badge with an SVG icon (Repeat) indicates multi-send
        if (badge.querySelector("svg")) return true;
      }
      return false;
    });
    expect(hasBadge).toBe(true);
  });

  it("shows Start instead of Send on the publish button", async () => {
    const cards = await $$(selectors.buttonCard);
    const cardCount = await cards.length;
    const lastCard = cards[cardCount - 1];
    const publishBtn = await lastCard.$(selectors.sendButton);
    expect(await getElText(publishBtn)).toBe("Start");
  });

  it("starts multi-send and shows Stop with count", async () => {
    const cards = await $$(selectors.buttonCard);
    const cardCount = await cards.length;
    const lastCard = cards[cardCount - 1];
    const publishBtn = await lastCard.$(selectors.sendButton);
    await publishBtn.click();

    await browser.waitUntil(
      async () => {
        const text = await getElText(publishBtn);
        return text.startsWith("Stop") && text.includes("(");
      },
      { timeout: 5000, timeoutMsg: "Multi-send did not start" }
    );

    // Verify the card has the active animation class
    const isActive = await browser.execute(() => {
      const cards = document.querySelectorAll(".button-card");
      const last = cards[cards.length - 1];
      return last?.classList.contains("multi-send-active") || false;
    });
    expect(isActive).toBe(true);
  });

  it("stops multi-send when clicking Stop", async () => {
    // Wait for multiple sends (default interval is 1s)
    await browser.pause(2500);

    const cards = await $$(selectors.buttonCard);
    const cardCount = await cards.length;
    const lastCard = cards[cardCount - 1];
    const publishBtn = await lastCard.$(selectors.sendButton);

    // Verify count is > 1 (multiple sends happened)
    const stopText = await getElText(publishBtn);
    const match = stopText.match(/\((\d+)\)/);
    expect(match).not.toBeNull();
    const count = parseInt(match![1]);
    expect(count).toBeGreaterThan(1);

    // Stop
    await publishBtn.click();

    await browser.waitUntil(
      async () => (await getElText(publishBtn)) === "Start",
      { timeout: 3000, timeoutMsg: "Multi-send did not stop" }
    );
  });

  it("disconnects", async () => {
    const disconnectBtn = await $("button=Disconnect");
    await disconnectBtn.click();
    await waitForConnectionStatus("Disconnected");
  });
});
