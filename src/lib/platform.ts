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
