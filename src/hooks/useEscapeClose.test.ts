import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEscapeClose } from "./useEscapeClose";

function press(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key }));
  });
}

describe("useEscapeClose", () => {
  it("closes on Escape", () => {
    const onClose = vi.fn();
    const hook = renderHook(() => useEscapeClose(onClose));

    press("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);

    hook.unmount();
    press("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores other keys", () => {
    const onClose = vi.fn();
    const hook = renderHook(() => useEscapeClose(onClose));

    press("Enter");
    press("e");
    expect(onClose).not.toHaveBeenCalled();

    hook.unmount();
  });

  it("closes only the top-most modal per Escape press", () => {
    const closeBottom = vi.fn();
    const closeTop = vi.fn();
    const bottom = renderHook(() => useEscapeClose(closeBottom));
    const top = renderHook(() => useEscapeClose(closeTop));

    press("Escape");
    expect(closeTop).toHaveBeenCalledTimes(1);
    expect(closeBottom).not.toHaveBeenCalled();

    top.unmount();
    press("Escape");
    expect(closeTop).toHaveBeenCalledTimes(1);
    expect(closeBottom).toHaveBeenCalledTimes(1);

    bottom.unmount();
  });

  it("uses the latest onClose callback", () => {
    const calls: string[] = [];
    const hook = renderHook(({ fn }: { fn: () => void }) => useEscapeClose(fn), {
      initialProps: { fn: () => calls.push("first") },
    });

    hook.rerender({ fn: () => calls.push("second") });
    press("Escape");
    expect(calls).toEqual(["second"]);

    hook.unmount();
  });
});
