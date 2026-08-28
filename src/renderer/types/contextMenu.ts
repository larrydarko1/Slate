/**
 * contextMenu — the shape of the right-click menu and of the handle a parent
 * holds on the ContextMenu component.
 * These live here rather than in ContextMenu.vue because a type exported from
 * an SFC is invisible to type-aware linting: the ESLint project service does
 * not compile `.vue`, so every import of it resolves to `any` and the checks
 * at the call sites silently stop running.
 */

export type MenuItem = {
    label: string;
    action?: () => void;
    separator?: boolean;
    danger?: boolean;
};

/** What a parent may call on a `ref` to the ContextMenu component. */
export type ContextMenuApi = {
    open: (x: number, y: number, menuItems: MenuItem[]) => void;
    close: () => void;
};
