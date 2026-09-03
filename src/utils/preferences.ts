export type DockPosition = "top" | "left" | "right";
export type PaneId = "commands" | "messages" | "publish";
export type DockPaneId = Exclude<PaneId, "commands">;

export const ALL_PANES: PaneId[] = ["commands", "messages", "publish"];
export const DOCK_PANES: DockPaneId[] = ["messages", "publish"];

const KEYS = {
  dockHeight: "dockHeight",
  dockWidth: "dockWidth",
  dockPosition: "dockPosition",
  dockSplit: "dockSplit",
  dockOrder: "dockOrder",
  visiblePanes: "visiblePanes",
  collapsedGroups: "collapsedGroups",
  sidebarWidth: "sidebarWidth",
} as const;

const DEFAULTS = {
  dockHeight: 220,
  dockWidth: 340,
  dockPosition: "top" as DockPosition,
  dockSplit: 0.5,
  sidebarWidth: 350,
};

function isPaneId(value: unknown): value is PaneId {
  return ALL_PANES.includes(value as PaneId);
}

export const preferences = {
  get dockHeight(): number {
    const saved = localStorage.getItem(KEYS.dockHeight);
    return saved ? parseInt(saved, 10) : DEFAULTS.dockHeight;
  },

  set dockHeight(value: number) {
    localStorage.setItem(KEYS.dockHeight, String(value));
  },

  get dockWidth(): number {
    const saved = localStorage.getItem(KEYS.dockWidth);
    return saved ? parseInt(saved, 10) : DEFAULTS.dockWidth;
  },

  set dockWidth(value: number) {
    localStorage.setItem(KEYS.dockWidth, String(value));
  },

  get dockPosition(): DockPosition {
    const saved = localStorage.getItem(KEYS.dockPosition);
    if (saved === "top" || saved === "left" || saved === "right") return saved;
    return DEFAULTS.dockPosition;
  },

  set dockPosition(value: DockPosition) {
    localStorage.setItem(KEYS.dockPosition, value);
  },

  get dockSplit(): number {
    const saved = parseFloat(localStorage.getItem(KEYS.dockSplit) ?? "");
    return Number.isFinite(saved) ? Math.min(0.85, Math.max(0.15, saved)) : DEFAULTS.dockSplit;
  },

  set dockSplit(value: number) {
    localStorage.setItem(KEYS.dockSplit, String(value));
  },

  get dockOrder(): DockPaneId[] {
    const saved = localStorage.getItem(KEYS.dockOrder);
    const parsed: unknown = saved ? JSON.parse(saved) : null;
    const isFullOrder =
      Array.isArray(parsed) &&
      parsed.length === DOCK_PANES.length &&
      DOCK_PANES.every((p) => parsed.includes(p));
    return isFullOrder ? (parsed as DockPaneId[]) : [...DOCK_PANES];
  },

  set dockOrder(value: DockPaneId[]) {
    localStorage.setItem(KEYS.dockOrder, JSON.stringify(value));
  },

  get visiblePanes(): PaneId[] {
    const saved = localStorage.getItem(KEYS.visiblePanes);
    if (!saved) return [...ALL_PANES];
    const parsed: unknown = JSON.parse(saved);
    const panes = Array.isArray(parsed) ? parsed.filter(isPaneId) : [];
    return panes.length > 0 ? panes : [...ALL_PANES];
  },

  set visiblePanes(value: PaneId[]) {
    localStorage.setItem(KEYS.visiblePanes, JSON.stringify(value));
  },

  get collapsedGroups(): string[] {
    const saved = localStorage.getItem(KEYS.collapsedGroups);
    return saved ? JSON.parse(saved) : [];
  },

  set collapsedGroups(value: string[]) {
    localStorage.setItem(KEYS.collapsedGroups, JSON.stringify(value));
  },

  get sidebarWidth(): number {
    const saved = localStorage.getItem(KEYS.sidebarWidth);
    return saved ? parseInt(saved, 10) : DEFAULTS.sidebarWidth;
  },

  set sidebarWidth(value: number) {
    localStorage.setItem(KEYS.sidebarWidth, String(value));
  },
};
