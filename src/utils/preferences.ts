const KEYS = {
    messageViewerHeight: 'messageViewerHeight',
    messageViewerExpanded: 'messageViewerExpanded',
    collapsedGroups: 'collapsedGroups',
} as const;

const DEFAULTS = {
    messageViewerHeight: 180,
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
        return localStorage.getItem(KEYS.messageViewerExpanded) === 'true';
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
};
