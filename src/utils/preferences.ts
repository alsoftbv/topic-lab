const KEYS = {
  messageViewerHeight: "messageViewerHeight",
  messageViewerExpanded: "messageViewerExpanded",
  collapsedGroups: "collapsedGroups",
  sidebarWidth: "sidebarWidth",
} as const;

const DEFAULTS = {
  messageViewerHeight: 180,
  sidebarWidth: 350,
};

export const preferences = {
  get messageViewerHeight(): number {
    const saved = localStorage.getItem(KEYS.messageViewerHeight);
    return saved ? parseInt(saved, 10) : DEFAULTS.messageViewerHeight;
  },

  set messageViewerHeight(value: number) {
    localStorage.setItem(KEYS.messageViewerHeight, String(value));
  },

  get messageViewerExpanded(): boolean {
    return localStorage.getItem(KEYS.messageViewerExpanded) === "true";
  },

  set messageViewerExpanded(value: boolean) {
    localStorage.setItem(KEYS.messageViewerExpanded, String(value));
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
