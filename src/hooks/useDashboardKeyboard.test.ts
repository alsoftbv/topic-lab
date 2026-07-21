import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDashboardKeyboard } from "./useDashboardKeyboard";
import type { Button, Connection } from "@/types";

function makeButton(id: string): Button {
  return { id, name: id, topic: `t/${id}`, qos: "atmostonce", retain: false };
}

function makeConnection(buttons: Button[]): Connection {
  return {
    id: "conn-1",
    name: "Test",
    broker_url: "broker.example.com",
    port: 1883,
    client_id: "client",
    use_tls: false,
    auto_connect: false,
    variables: {},
    buttons,
    groups: [],
    subscriptions: [],
  };
}

function setup(activeConnection: Connection, visibleButtons: Button[]) {
  const duplicateButton = vi.fn().mockResolvedValue("new-id");
  const hook = renderHook(() =>
    useDashboardKeyboard({
      activeConnection,
      visibleButtons,
      groupNav: [{ id: "__ungrouped__", start: 0, count: visibleButtons.length }],
      modalsOpen: false,
      duplicateButton,
      onEdit: vi.fn(),
      onDelete: vi.fn(),
      onNewButton: vi.fn(),
      onToggleMessageViewer: vi.fn(),
      onToggleGroup: vi.fn(),
    })
  );
  return { hook, duplicateButton };
}

function press(key: string, init: KeyboardEventInit = {}) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, ...init }));
  });
}

describe("useDashboardKeyboard quick send", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("indexes number shortcuts by visible order, not storage order", () => {
    const a = makeButton("a");
    const b = makeButton("b");
    const c = makeButton("c");
    const { hook } = setup(makeConnection([a, b, c]), [c, a]);

    press("1", { metaKey: true });
    expect(hook.result.current.keyboardSend?.id).toBe("c");

    press("2", { metaKey: true });
    expect(hook.result.current.keyboardSend?.id).toBe("a");

    hook.unmount();
  });

  it("does nothing for a number beyond the visible buttons", () => {
    const a = makeButton("a");
    const b = makeButton("b");
    const { hook } = setup(makeConnection([a, b]), [a]);

    press("2", { metaKey: true });
    expect(hook.result.current.keyboardSend).toBeNull();

    hook.unmount();
  });

  it("issues a new nonce for rapid repeat presses of the same button", () => {
    const a = makeButton("a");
    const { hook } = setup(makeConnection([a]), [a]);

    press("1", { metaKey: true });
    const first = hook.result.current.keyboardSend;
    expect(first?.id).toBe("a");

    press("1", { metaKey: true });
    const second = hook.result.current.keyboardSend;
    expect(second?.id).toBe("a");
    expect(second!.nonce).toBeGreaterThan(first!.nonce);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(hook.result.current.keyboardSend).toBeNull();

    press("1", { metaKey: true });
    expect(hook.result.current.keyboardSend?.id).toBe("a");

    hook.unmount();
  });

  it("sends the selected button on Enter", () => {
    const a = makeButton("a");
    const b = makeButton("b");
    const { hook } = setup(makeConnection([a, b]), [b, a]);

    act(() => {
      hook.result.current.setSelectedIndex(0);
    });
    press("Enter");
    expect(hook.result.current.keyboardSend?.id).toBe("b");

    hook.unmount();
  });
});

describe("useDashboardKeyboard copy shortcut", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("copies the selected button when no text is selected", () => {
    const a = makeButton("a");
    const { hook, duplicateButton } = setup(makeConnection([a]), [a]);

    act(() => {
      hook.result.current.setSelectedIndex(0);
    });
    press("c", { metaKey: true });
    press("v", { metaKey: true });

    expect(duplicateButton).toHaveBeenCalledWith(a, a.id);

    hook.unmount();
  });

  it("skips the copy shortcut while text is selected", () => {
    const a = makeButton("a");
    const { hook, duplicateButton } = setup(makeConnection([a]), [a]);

    vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "highlighted text",
    } as Selection);

    act(() => {
      hook.result.current.setSelectedIndex(0);
    });
    press("c", { metaKey: true });
    press("v", { metaKey: true });

    expect(duplicateButton).not.toHaveBeenCalled();

    hook.unmount();
  });
});
