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

  it("shows the messages pane and subscribes to a topic", async () => {
    if (!(await $(selectors.messagesPane).isExisting())) {
      await (await $(selectors.paneToggleMessages)).click();
    }
    await $(selectors.messagesPane).waitForExist({ timeout: 3000 });

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

  it("publishes from the publish pane", async () => {
    if (!(await $(selectors.publishPane).isExisting())) {
      await (await $(selectors.paneTogglePublish)).click();
    }
    await $(selectors.publishPane).waitForExist({ timeout: 3000 });

    await setInputValue(selectors.publishTopic, "test/e2e/sendbar");
    await setInputValue(selectors.publishPayload, "hello from send bar");

    const sendBtn = await $(selectors.publishButton);
    await sendBtn.click();

    await browser.waitUntil(
      async () => {
        const topics = await $$(selectors.messageTopic);
        for (const t of topics) {
          if ((await getElText(t)) === "test/e2e/sendbar") return true;
        }
        return false;
      },
      { timeout: 5000, timeoutMsg: "Send bar message not received" }
    );

    const messages = await $$(selectors.messageItem);
    const msgCount = await messages.length;
    const lastMsg = messages[msgCount - 1];
    const payload = await lastMsg.$(selectors.messagePayload);
    expect(await getElText(payload)).toBe("hello from send bar");
  });

  it("opens the button editor prefilled from the publish pane", async () => {
    const makeBtn = await $(selectors.makeButton);
    await makeBtn.click();

    const modal = await $(selectors.editorModal);
    await modal.waitForExist({ timeout: 3000 });

    expect(await $(selectors.editorTopicInput).getValue()).toBe("test/e2e/sendbar");
    expect(await $(selectors.editorPayloadTextarea).getValue()).toBe("hello from send bar");

    const cancelBtn = await $("button=Cancel");
    await cancelBtn.click();
    await modal.waitForExist({ timeout: 3000, reverse: true });
  });

  it("opens a command in the publish pane", async () => {
    const card = await $(selectors.buttonCard);
    const cardTopic = await getElText(await card.$("code"));
    await (await card.$("button[title='Open in Publish']")).click();

    await browser.waitUntil(
      async () => (await $(selectors.publishTopic).getValue()) === cardTopic,
      { timeout: 3000, timeoutMsg: "Publish topic was not filled from the command" }
    );
  });

  it("shows resolved variables in the publish pane when unfocused", async () => {
    const varsBtn = await $("button*=Variables");
    await varsBtn.click();
    await $(selectors.variablesPanel).waitForExist({ timeout: 3000 });

    await setInputValue(".add-variable-form input[placeholder='Name']", "device_id");
    await setInputValue(".add-variable-form input[placeholder='Value']", "sensor-001");
    const addBtn = await $(".add-variable-form .btn");
    await addBtn.click();
    await browser.waitUntil(async () => await $(".variable-key=device_id").isExisting(), {
      timeout: 5000,
      timeoutMsg: "Variable 'device_id' was not created",
    });

    await varsBtn.click();
    await browser.pause(300);

    await setInputValue(selectors.publishTopic, "test/{device_id}");
    const topicInput = await $(selectors.publishTopic);
    await browser.waitUntil(async () => (await topicInput.getValue()) === "test/sensor-001", {
      timeout: 5000,
      timeoutMsg: "Publish topic did not show the resolved value when unfocused",
    });

    await topicInput.click();
    await browser.waitUntil(async () => (await topicInput.getValue()) === "test/{device_id}", {
      timeout: 5000,
      timeoutMsg: "Publish topic did not show the raw template when focused",
    });

    const sendBtn = await $(selectors.publishButton);
    await sendBtn.click();

    await browser.waitUntil(
      async () => {
        const topics = await $$(selectors.messageTopic);
        for (const t of topics) {
          if ((await getElText(t)) === "test/sensor-001") return true;
        }
        return false;
      },
      { timeout: 5000, timeoutMsg: "Publish message with resolved variable not received" }
    );
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
