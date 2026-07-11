/** Last path segment of the workspace folder, or "Workspace" when unknown. */
export function baseName(path: string | null): string {
  const fallback = "Workspace";
  if (!path) return fallback;
  return path.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || fallback;
}

/**
 * Folder picker for a fresh draft, shown in the session header next to the
 * title. On the desktop build a draft starts in a new dated folder and this
 * chip opens the native picker; the web build has no native filesystem, so —
 * exactly as the reference (which hid the chip unless `isTauri`) — it renders
 * nothing here.
 */
export function WorkspaceChip() {
  return null;
}
