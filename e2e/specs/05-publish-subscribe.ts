import {
  selectors,
  waitForDashboard,
  waitForConnectionStatus,
  openButtonEditor,
  setInputValue,
  getElText,
} from "../helpers.js";

describe("Publish & Subscribe", () => {
  before(async () => {
    await waitForDashboard();
  });

  it("connects to the aedes broker", async () => {
    const connectBtn = await $("button=Connect");
    if (await connectBtn.isExisting()) {
      await connectBtn.click();
    }

    await waitForConnectionStatus("Connected");
  });

  it("opens message viewer and subscribes to a topic", async () => {
    const header = await $(selectors.messageViewerHeader);
    await header.click();

    const content = await $(selectors.messageViewerContent);
    await content.waitForExist({ timeout: 3000 });

    await setInputValue(".subscribe-form input", "test/#");

    const subBtn = await $(".subscribe-form .btn");
    await subBtn.click();

    await browser.waitUntil(async () => await $(".sub-editable=test/#").isExisting(), {
      timeout: 5000,
      timeoutMsg: "Subscription 'test/#' was not created",
    });
  });

  it("sends a button and verifies message in viewer", async () => {
    if ((await $$(selectors.sendButton).length) > 0) {
      const firstSendBtn = await $(selectors.sendButton);
      await firstSendBtn.click();
    }

    await browser.waitUntil(async () => (await $$(selectors.messageItem).length) > 0, {
      timeout: 5000,
      timeoutMsg: "No message received in message viewer",
    });

    const msgTopic = await $(selectors.messageTopic);
    expect(await getElText(msgTopic)).toContain("test/");
  });

  it("creates a button and verifies full round trip", async () => {
    await openButtonEditor();

    await setInputValue("#buttonName", "PubSub Test");
    await setInputValue("#topic", "test/e2e/roundtrip");
    await setInputValue("#payload", "hello from e2e");

    const submitBtn = await $("button=Create");
    await submitBtn.click();

    await browser.pause(500);

    const cards = await $$(selectors.buttonCard);
    const cardCount = await cards.length;
    const lastCard = cards[cardCount - 1];
    const sendBtn = await lastCard.$(selectors.sendButton);
    await sendBtn.click();

    await browser.waitUntil(
      async () => {
        const topics = await $$(selectors.messageTopic);
        for (const t of topics) {
          if ((await getElText(t)) === "test/e2e/roundtrip") return true;
        }
        return false;
      },
      { timeout: 5000, timeoutMsg: "Round-trip message not received" }
    );

    const messages = await $$(selectors.messageItem);
    const msgCount = await messages.length;
    const lastMsg = messages[msgCount - 1];
    const payload = await lastMsg.$(selectors.messagePayload);
    expect(await getElText(payload)).toBe("hello from e2e");
  });

  it("disconnects", async () => {
    const disconnectBtn = await $("button=Disconnect");
    await disconnectBtn.click();
    await waitForConnectionStatus("Disconnected");
  });
});
