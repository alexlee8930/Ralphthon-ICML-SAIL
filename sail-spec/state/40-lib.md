# 40 · 상태·유틸 (store · cn · platform · toast)

의존: 01-foundation

산출 파일:

- `src/lib/cn.ts`
- `src/lib/store.ts`
- `src/lib/platform.ts`
- `src/lib/toast.ts`

---

전역 상태(recoil atom + zustand-형 useUiStore)와 공용 유틸.
- `manuscriptHighlightState`: 원고 패널에 헝크 하이라이트를 넘기는 다리.
- `useUiStore`: 사이드바 접힘·테마 등 UI 상태 (localStorage 동기화).
- `toast.ts`: 구독형 토스트 버스 — Toaster(ui/55)가 소비.


---

### 파일: `src/lib/cn.ts` (7줄) — **verbatim, 글자 그대로 사용**

````ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names, resolving Tailwind conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
````

### 파일: `src/lib/store.ts` (193줄) — **verbatim, 글자 그대로 사용**

````ts
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


/** Manuscript phrases to highlight (attribution evidence hover). Null = none. */
export const manuscriptHighlightState = atom<{ feature: string; phrases: string[] } | null>({
  key: "ui/manuscriptHighlight",
  default: null,
});

/** Convenience setter used by keyboard shortcuts. */
export function useToggleSidebar() {
  const set = useSetRecoilState(sidebarCollapsedState);
  return useCallback(() => set((v) => !v), [set]);
}

/** Web build: no macOS overlay titlebar, never inset for traffic lights. */
export function useOverlayTitlebar(): boolean {
  return false;
}
````

### 파일: `src/lib/platform.ts` (19줄) — **verbatim, 글자 그대로 사용**

````ts
/**
 * Web replacements for the reference app's desktop (Tauri) helpers.
 * Ported components import these instead of `@/lib/tauri`.
 */
export const isTauri = false;

export function isMacUA(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
}

/** Open a link in a new tab (desktop build opened the system browser). */
export function openExternal(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

/** No native fullscreen tracking on the web. */
export function watchFullscreen(_cb: (fs: boolean) => void): Promise<() => void> {
  return Promise.resolve(() => {});
}
````

### 파일: `src/lib/toast.ts` (43줄) — **verbatim, 글자 그대로 사용**

````ts
/**
 * Tiny imperative toast bus (UI-ephemeral, so not part of Recoil app state).
 * Same call surface as the reference: toast("msg"), toast.error("msg").
 */
export type ToastKind = "info" | "ok" | "error";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

type Listener = (toasts: ToastItem[]) => void;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(items);
}

function push(kind: ToastKind, message: string, ttlMs = 3200) {
  const id = nextId++;
  items = [...items, { id, kind, message }];
  emit();
  window.setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, ttlMs);
}

export function toast(message: string) {
  push("info", message);
}
toast.ok = (message: string) => push("ok", message);
toast.error = (message: string) => push("error", message, 5200);

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(items);
  return () => listeners.delete(listener);
}
````
