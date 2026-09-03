import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Connection } from "@/types";
import { moveConnection, useConnectionDrag } from "./useConnectionDrag";

function conn(id: string): Connection {
  return {
    id,
    name: id,
    broker_url: "localhost",
    port: 1883,
    client_id: id,
    use_tls: false,
    auto_connect: false,
    variables: {},
    buttons: [],
    groups: [],
    subscriptions: [],
  };
}

const ids = (list: Connection[]) => list.map((c) => c.id);
const connections = [conn("a"), conn("b"), conn("c")];

function releaseMouse() {
  act(() => {
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
}

describe("moveConnection", () => {
  it("moves an item above the target", () => {
    expect(ids(moveConnection(connections, "c", "a", "top")!)).toEqual(["c", "a", "b"]);
  });

  it("moves an item below the target", () => {
    expect(ids(moveConnection(connections, "a", "c", "bottom")!)).toEqual(["b", "c", "a"]);
  });

  it("returns null when the order would not change", () => {
    expect(moveConnection(connections, "a", "a", "top")).toBeNull();
    expect(moveConnection(connections, "b", "a", "bottom")).toBeNull();
    expect(moveConnection(connections, "a", "b", "top")).toBeNull();
    expect(moveConnection(connections, "missing", "a", "top")).toBeNull();
  });
});

describe("useConnectionDrag", () => {
  it("reorders on mouseup after dragging over another row", () => {
    const reorder = vi.fn();
    const { result } = renderHook(() =>
      useConnectionDrag({ connections, reorderConnections: reorder })
    );

    act(() => result.current.handleDragStart("c"));
    expect(result.current.dragId).toBe("c");
    expect(document.body.style.cursor).toBe("grabbing");

    act(() => result.current.handleDragOver("a", "top"));
    expect(result.current.dragOverId).toBe("a");
    expect(result.current.dragOverSide).toBe("top");

    releaseMouse();
    expect(reorder).toHaveBeenCalledTimes(1);
    expect(ids(reorder.mock.calls[0][0])).toEqual(["c", "a", "b"]);
    expect(result.current.dragId).toBeNull();
    expect(result.current.dragOverId).toBeNull();
    expect(document.body.style.cursor).toBe("");
  });

  it("does not reorder when dropped on itself", () => {
    const reorder = vi.fn();
    const { result } = renderHook(() =>
      useConnectionDrag({ connections, reorderConnections: reorder })
    );

    act(() => result.current.handleDragStart("b"));
    releaseMouse();
    expect(reorder).not.toHaveBeenCalled();
    expect(result.current.dragId).toBeNull();
  });

  it("ignores drag-over updates when no drag is active", () => {
    const reorder = vi.fn();
    const { result } = renderHook(() =>
      useConnectionDrag({ connections, reorderConnections: reorder })
    );

    act(() => result.current.handleDragOver("a", "bottom"));
    expect(result.current.dragOverId).toBeNull();

    releaseMouse();
    expect(reorder).not.toHaveBeenCalled();
  });

  it("flags a recent drag until the click that follows mouseup has passed", async () => {
    const reorder = vi.fn();
    const { result } = renderHook(() =>
      useConnectionDrag({ connections, reorderConnections: reorder })
    );

    expect(result.current.recentDragRef.current).toBe(false);
    act(() => result.current.handleDragStart("a"));
    expect(result.current.recentDragRef.current).toBe(true);

    releaseMouse();
    expect(result.current.recentDragRef.current).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.recentDragRef.current).toBe(false);
  });
});
