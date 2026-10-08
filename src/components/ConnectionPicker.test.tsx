import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Connection } from "@/types";

vi.mock("@/contexts/AppContext", () => ({
  useApp: vi.fn(),
}));

vi.mock("@/hooks/useConnectionImport", () => ({
  useConnectionImport: () => ({ importError: null, handleImport: vi.fn() }),
}));

vi.mock("./ConnectionEditor", () => ({
  ConnectionEditor: () => <div data-testid="connection-editor" />,
}));

import { useApp } from "@/contexts/AppContext";
import { ConnectionPicker } from "./ConnectionPicker";

function conn(id: string, name: string): Connection {
  return { id, name, broker_url: `${id}.broker` } as Connection;
}

function mockApp(openElsewhere: string[] = []) {
  const switchConnection = vi.fn();
  vi.mocked(useApp).mockReturnValue({
    data: { connections: [conn("a", "Alpha"), conn("b", "Beta")] },
    error: null,
    switchConnection,
    isOpenElsewhere: (id: string) => openElsewhere.includes(id),
  } as unknown as ReturnType<typeof useApp>);
  return { switchConnection };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ConnectionPicker", () => {
  it("lists every connection with its broker", () => {
    mockApp();
    render(<ConnectionPicker />);

    const options = screen.getAllByRole("button", { name: /broker/ });
    expect(options.map((o) => o.textContent)).toEqual(["Alphaa.broker", "Betab.broker"]);
  });

  it("marks connections that are open in another window", () => {
    mockApp(["b"]);
    render(<ConnectionPicker />);

    expect(screen.getByRole("button", { name: /Alpha/ })).not.toHaveTextContent("Already open");
    expect(screen.getByRole("button", { name: /Beta/ })).toHaveTextContent("Already open");
  });

  it("opens the picked connection", () => {
    const { switchConnection } = mockApp();
    render(<ConnectionPicker />);

    fireEvent.click(screen.getByRole("button", { name: /Beta/ }));

    expect(switchConnection).toHaveBeenCalledWith("b");
  });

  it("opens the editor for a new connection", () => {
    mockApp();
    render(<ConnectionPicker />);

    fireEvent.click(screen.getByRole("button", { name: "New Connection" }));

    expect(screen.getByTestId("connection-editor")).toBeInTheDocument();
  });
});
