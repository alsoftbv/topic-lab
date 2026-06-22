export const selectors = {
  // Setup Wizard
  wizardTitle: ".setup-wizard h1",
  wizardNameInput: "#name",
  wizardBrokerInput: "#brokerUrl",
  wizardPortInput: "#port",
  wizardClientIdInput: "#clientId",

  // Dashboard
  dashboard: ".dashboard",
  connectionName: ".connection-name",

  // Connection Status
  statusLabel: ".status-label",

  // Buttons
  buttonCard: ".button-card",
  buttonName: ".button-card h3",
  sendButton: ".btn-publish",

  // Button Editor
  editorModal: ".modal",
  editorNameInput: "#buttonName",
  editorTopicInput: "#topic",
  editorPayloadTextarea: "#payload",

  // Variables Panel
  variablesPanel: ".variables-panel",
  variableKey: ".variable-key",
  variableValue: ".variable-value",

  // Message Viewer
  messageViewerHeader: ".message-viewer-header",
  messageViewerContent: ".message-viewer-content",
  messageItem: ".message-item",
  messageTopic: ".message-topic",
  messagePayload: ".message-payload",

  // Connection Switcher
  switcherButton: ".connection-switcher-button",
  switcherDropdown: ".connection-dropdown",

  // Settings Modal
  settingsButton: ".header-right .btn-icon-only",

  // Groups
  buttonGroup: ".button-group",
  buttonGroupHeader: ".button-group-header",
  buttonGroupName: ".button-group-name",
  buttonsGrid: ".buttons-grid",
  newGroupArea: ".new-group-area",
  newGroupInput: ".new-group-input input",
  newGroupCreate: ".new-group-input .btn",
};

export async function waitForAppReady(): Promise<void> {
  await browser.waitUntil(
    async () => {
      const wizard = await $(selectors.wizardTitle);
      const dashboard = await $(selectors.dashboard);
      return (await wizard.isExisting()) || (await dashboard.isExisting());
    },
    { timeout: 15000, timeoutMsg: "App did not load within 15 seconds" }
  );
}

export async function waitForDashboard(): Promise<void> {
  await browser.waitUntil(
    async () => {
      const dashboard = await $(selectors.dashboard);
      return await dashboard.isExisting();
    },
    { timeout: 15000, timeoutMsg: "Dashboard did not load within 15 seconds" }
  );
}

export async function waitForConnectionStatus(status: string): Promise<void> {
  await browser.waitUntil(
    async () => {
      const label = await $(selectors.statusLabel);
      if (!(await label.isExisting())) return false;
      const text = await label.getText();
      return text.toLowerCase().includes(status.toLowerCase());
    },
    { timeout: 10000, timeoutMsg: `Connection did not reach "${status}" status` }
  );
}

// WebDriver getText() returns "" for elements with overflow:hidden/text-overflow:ellipsis
// in webkit2gtk-driver. Use textContent via execute instead.
export async function getElText(element: any): Promise<string> {
  return await browser.execute(
    (el: HTMLElement) => el?.textContent?.trim() || "",
    element as unknown as HTMLElement
  );
}

export async function getTextByCss(cssSelector: string): Promise<string> {
  return await browser.execute(
    (sel: string) => document.querySelector(sel)?.textContent?.trim() || "",
    cssSelector
  );
}

export async function setInputValue(cssSelector: string, value: string): Promise<void> {
  await browser.execute(
    (sel: string, val: string) => {
      const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement;
      if (!el) throw new Error(`Element not found: ${sel}`);
      const proto =
        el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, val);
      const propsKey = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
      if (propsKey) {
        (el as any)[propsKey].onChange?.({ target: el, currentTarget: el });
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    cssSelector,
    value
  );
}

export async function setElementValue(element: any, value: string): Promise<void> {
  await browser.execute(
    (el: HTMLInputElement | HTMLTextAreaElement, val: string) => {
      if (!el) throw new Error("Element not found");
      const proto =
        el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, val);
      const propsKey = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
      if (propsKey) {
        (el as any)[propsKey].onChange?.({ target: el, currentTarget: el });
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    element as unknown as HTMLInputElement,
    value
  );
}

export async function sendKey(key: string): Promise<void> {
  await browser.execute((k: string) => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: k,
        bubbles: true,
        cancelable: true,
      })
    );
  }, key);
}

export async function openEditorViaShortcut(
  key: string,
  modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean } = { ctrl: true },
  timeout = 8000
): Promise<void> {
  const modal = await $(selectors.editorModal);
  await browser.waitUntil(
    async () => {
      if (await modal.isExisting()) return true;
      await sendShortcut(key, modifiers);
      await browser.pause(100);
      return await modal.isExisting();
    },
    { timeout, interval: 200, timeoutMsg: `Editor modal did not open via "${key}"` }
  );
}

export function openButtonEditor(): Promise<void> {
  return openEditorViaShortcut("n");
}

export function editSelectedButton(): Promise<void> {
  return openEditorViaShortcut("e");
}

export async function sendShortcut(
  key: string,
  modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}
): Promise<void> {
  await browser.execute(
    (k: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean }) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: k,
          ctrlKey: mods.ctrl || false,
          shiftKey: mods.shift || false,
          altKey: mods.alt || false,
          bubbles: true,
          cancelable: true,
        })
      );
    },
    key,
    modifiers
  );
}
