import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReleaseNotesModal, ReleaseNotesSettings } from "./ReleaseNotes";
import type { ReleaseNotesState } from "@/hooks/useReleaseNotes";

function makeState(overrides: Partial<ReleaseNotesState> = {}): ReleaseNotesState {
  return {
    notes: { version: "0.5.0", items: ["Multiple windows", "Release notes"] },
    openedFrom: "update",
    enabled: true,
    show: vi.fn(),
    dismiss: vi.fn(),
    setEnabled: vi.fn(),
    ...overrides,
  };
}

describe("ReleaseNotesModal", () => {
  it("lists the items under the version title", () => {
    render(<ReleaseNotesModal releaseNotes={makeState()} suppressed={false} />);

    expect(screen.getByRole("heading", { name: "What's new in v0.5.0" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Multiple windows",
      "Release notes",
    ]);
  });

  it("OK dismisses without opting out", () => {
    const state = makeState();
    render(<ReleaseNotesModal releaseNotes={state} suppressed={false} />);

    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    expect(state.dismiss).toHaveBeenCalledWith(false);
  });

  it("Don't show again dismisses and opts out", () => {
    const state = makeState();
    render(<ReleaseNotesModal releaseNotes={state} suppressed={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Don't show again" }));

    expect(state.dismiss).toHaveBeenCalledWith(true);
  });

  it("Escape dismisses without opting out", () => {
    const state = makeState();
    render(<ReleaseNotesModal releaseNotes={state} suppressed={false} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(state.dismiss).toHaveBeenCalledWith(false);
  });

  it("hides Don't show again when opened from Preferences", () => {
    render(
      <ReleaseNotesModal releaseNotes={makeState({ openedFrom: "manual" })} suppressed={false} />
    );

    expect(screen.getByRole("button", { name: "OK" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Don't show again" })).not.toBeInTheDocument();
  });

  it("renders nothing when closed, suppressed or without notes", () => {
    const { container, rerender } = render(
      <ReleaseNotesModal releaseNotes={makeState({ openedFrom: null })} suppressed={false} />
    );
    expect(container).toBeEmptyDOMElement();

    rerender(<ReleaseNotesModal releaseNotes={makeState()} suppressed={true} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<ReleaseNotesModal releaseNotes={makeState({ notes: null })} suppressed={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ReleaseNotesSettings", () => {
  it("reflects and toggles the setting", () => {
    const state = makeState({ enabled: false, openedFrom: null });
    render(<ReleaseNotesSettings releaseNotes={state} />);

    const checkbox = screen.getByRole("checkbox", { name: "Show what's new after updating" });
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);

    expect(state.setEnabled).toHaveBeenCalledWith(true);
  });

  it("opens the current notes on demand", () => {
    const state = makeState({ openedFrom: null });
    render(<ReleaseNotesSettings releaseNotes={state} />);

    fireEvent.click(screen.getByRole("button", { name: "What's new in v0.5.0" }));

    expect(state.show).toHaveBeenCalled();
  });

  it("hides the button when the build has no notes", () => {
    render(<ReleaseNotesSettings releaseNotes={makeState({ notes: null, openedFrom: null })} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
