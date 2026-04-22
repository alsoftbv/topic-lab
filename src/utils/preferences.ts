const KEYS = {
  messageViewerHeight: "messageViewerHeight",
  messageViewerWidth: "messageViewerWidth",
  messageViewerExpanded: "messageViewerExpanded",
  messageViewerPosition: "messageViewerPosition",
  collapsedGroups: "collapsedGroups",
  sidebarWidth: "sidebarWidth",
} as const;

const DEFAULTS = {
  messageViewerHeight: 180,
  messageViewerWidth: 320,
  messageViewerPosition: "top" as MessageViewerPosition,
  sidebarWidth: 350,
};

export type MessageViewerPosition = "top" | "left" | "right";

export const preferences = {
  get messageViewerHeight(): number {
    const saved = localStorage.getItem(KEYS.messageViewerHeight);
    return saved ? parseInt(saved, 10) : DEFAULTS.messageViewerHeight;
  },

  set messageViewerHeight(value: number) {
    localStorage.setItem(KEYS.messageViewerHeight, String(value));
  },

  get messageViewerWidth(): number {
    const saved = localStorage.getItem(KEYS.messageViewerWidth);
    return saved ? parseInt(saved, 10) : DEFAULTS.messageViewerWidth;
  },

  set messageViewerWidth(value: number) {
    localStorage.setItem(KEYS.messageViewerWidth, String(value));
  },

  get messageViewerExpanded(): boolean {
    return localStorage.getItem(KEYS.messageViewerExpanded) === "true";
  },

  set messageViewerExpanded(value: boolean) {
    localStorage.setItem(KEYS.messageViewerExpanded, String(value));
  },

  get messageViewerPosition(): MessageViewerPosition {
    const saved = localStorage.getItem(KEYS.messageViewerPosition);
    if (saved === "top" || saved === "left" || saved === "right") return saved;
    return DEFAULTS.messageViewerPosition;
  },

  set messageViewerPosition(value: MessageViewerPosition) {
    localStorage.setItem(KEYS.messageViewerPosition, value);
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
