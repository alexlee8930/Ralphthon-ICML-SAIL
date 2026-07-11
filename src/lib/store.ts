/**
 * UI state — Recoil port of the reference zustand store.
 * Same shape and px constants as the reference app so ported components
 * keep identical layout math. Persisted keys mirror the original.
 */
import { atom, useRecoilState, useSetRecoilState, type AtomEffect } from "recoil";
import { useCallback } from "react";

export type Theme = "light" | "dark";

const THEME_KEY = "ralph.theme";
const SIDEBAR_WIDTH_KEY = "ralph.sidebar.width";
const SIDEBAR_COLLAPSED_KEY = "ralph.sidebar.collapsed";
const INSPECTOR_WIDTH_KEY = "ralph.inspector.width";

export const SIDEBAR_MIN = 184;
export const SIDEBAR_MAX = 340;
export const SIDEBAR_DEFAULT = 232;

export const INSPECTOR_MIN = 360;
export const INSPECTOR_MAX = 960;
export const INSPECTOR_DEFAULT = 560;

function localStorageEffect<T>(
  key: string,
  serialize: (v: T) => string,
  deserialize: (raw: string) => T | undefined,
): AtomEffect<T> {
  return ({ setSelf, onSet }) => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(key);
    if (saved !== null) {
      const parsed = deserialize(saved);
      if (parsed !== undefined) setSelf(parsed);
    }
    onSet((v) => window.localStorage.setItem(key, serialize(v)));
  };
}

function systemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export const themeState = atom<Theme>({
  key: "ui/theme",
  default: systemTheme(),
  effects: [
    localStorageEffect(
      THEME_KEY,
      (v) => v,
      (raw) => (raw === "light" || raw === "dark" ? raw : undefined),
    ),
  ],
});

export const sidebarCollapsedState = atom<boolean>({
  key: "ui/sidebarCollapsed",
  default: false,
  effects: [
    localStorageEffect(
      SIDEBAR_COLLAPSED_KEY,
      (v) => (v ? "1" : "0"),
      (raw) => raw === "1",
    ),
  ],
});

export const sidebarWidthState = atom<number>({
  key: "ui/sidebarWidth",
  default: SIDEBAR_DEFAULT,
  effects: [
    localStorageEffect(
      SIDEBAR_WIDTH_KEY,
      String,
      (raw) => {
        const n = Number(raw);
        if (!Number.isFinite(n) || n === 0) return undefined;
        return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, n));
      },
    ),
  ],
});

export const inspectorOpenState = atom<boolean>({ key: "ui/inspectorOpen", default: true });

export const inspectorWidthState = atom<number>({
  key: "ui/inspectorWidth",
  default: INSPECTOR_DEFAULT,
  effects: [
    localStorageEffect(
      INSPECTOR_WIDTH_KEY,
      String,
      (raw) => {
        const n = Number(raw);
        if (!Number.isFinite(n) || n === 0) return undefined;
        return Math.min(INSPECTOR_MAX, Math.max(INSPECTOR_MIN, n));
      },
    ),
  ],
});

export const inspectorMaximizedState = atom<boolean>({
  key: "ui/inspectorMaximized",
  default: false,
});

export const isFullscreenState = atom<boolean>({ key: "ui/isFullscreen", default: false });
export const paletteOpenState = atom<boolean>({ key: "ui/paletteOpen", default: false });

/** One-shot text placed into the composer by another surface — consumed on
 *  the next composer render (same contract as the reference). */
export const composerDraftState = atom<string | null>({
  key: "ui/composerDraft",
  default: null,
});

/** Drop-in equivalent of the reference `useUiStore()` hook surface. */
export function useUiStore() {
  const [theme, setThemeRaw] = useRecoilState(themeState);
  const [sidebarCollapsed, setSidebarCollapsedRaw] = useRecoilState(sidebarCollapsedState);
  const [sidebarWidth, setSidebarWidthRaw] = useRecoilState(sidebarWidthState);
  const [inspectorOpen, setInspectorOpen] = useRecoilState(inspectorOpenState);
  const [inspectorWidth, setInspectorWidthRaw] = useRecoilState(inspectorWidthState);
  const [inspectorMaximized, setInspectorMaximized] = useRecoilState(inspectorMaximizedState);
  const [isFullscreen, setIsFullscreen] = useRecoilState(isFullscreenState);
  const [paletteOpen, setPaletteOpen] = useRecoilState(paletteOpenState);
  const [composerDraft, setComposerDraft] = useRecoilState(composerDraftState);

  const setTheme = useCallback((t: Theme) => setThemeRaw(t), [setThemeRaw]);
  const toggleTheme = useCallback(
    () => setThemeRaw((t) => (t === "light" ? "dark" : "light")),
    [setThemeRaw],
  );
  const setSidebarCollapsed = useCallback(
    (v: boolean) => setSidebarCollapsedRaw(v),
    [setSidebarCollapsedRaw],
  );
  const toggleSidebar = useCallback(
    () => setSidebarCollapsedRaw((v) => !v),
    [setSidebarCollapsedRaw],
  );
  const setSidebarWidth = useCallback(
    (w: number) => setSidebarWidthRaw(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(w)))),
    [setSidebarWidthRaw],
  );
  const setInspectorWidth = useCallback(
    (w: number) =>
      setInspectorWidthRaw(Math.min(INSPECTOR_MAX, Math.max(INSPECTOR_MIN, Math.round(w)))),
    [setInspectorWidthRaw],
  );

  return {
    theme,
    sidebarCollapsed,
    sidebarWidth,
    inspectorOpen,
    inspectorWidth,
    inspectorMaximized,
    isFullscreen,
    paletteOpen,
    composerDraft,
    setTheme,
    toggleTheme,
    setSidebarCollapsed,
    toggleSidebar,
    setSidebarWidth,
    setInspectorOpen,
    setInspectorWidth,
    setInspectorMaximized,
    setIsFullscreen,
    setPaletteOpen,
    setComposerDraft,
  };
}

/** Convenience setter used by keyboard shortcuts. */
export function useToggleSidebar() {
  const set = useSetRecoilState(sidebarCollapsedState);
  return useCallback(() => set((v) => !v), [set]);
}

/** Web build: no macOS overlay titlebar, never inset for traffic lights. */
export function useOverlayTitlebar(): boolean {
  return false;
}
