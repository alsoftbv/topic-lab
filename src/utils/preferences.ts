const KEYS = {
    messageViewerHeight: 'messageViewerHeight',
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
};
