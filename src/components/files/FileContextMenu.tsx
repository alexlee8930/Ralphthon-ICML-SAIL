import * as ContextMenu from "@radix-ui/react-context-menu";
import { Copy, ExternalLink, FolderOpen } from "lucide-react";
import type { FileRoot } from "@/lib/artifacts";
import { isMacUA } from "@/lib/platform";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/cn";

/** A file/folder row in the explorer. Local port of the desktop `DirEntry`
 *  (the web build has no filesystem bridge; the Files page drives this from a
 *  static artifact tree). Shared with `FilesPage`. */
export interface DirEntry {
  name: string;
  /** Base-relative path. */
  path: string;
  isDir: boolean;
  size: number;
}

// The reveal action's NAME matches the platform's file manager (label-only).
const isWin = typeof navigator !== "undefined" && navigator.userAgent.includes("Win");
const REVEAL_LABEL = isMacUA() ? "Reveal in Finder" : isWin ? "Show in File Explorer" : "Show in File Manager";

// The absolute roots the static tree resolves against, used to synthesize an
// absolute path for the "Copy path" action (mirrors the desktop `FileRoot`).
const ROOT_PATH: Record<FileRoot, string> = {
  workspace: "/workspace/papers",
  base: "/workspace",
};

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.ok(`${what} copied`);
  } catch {
    toast.error("Could not copy to the clipboard.");
  }
}

/**
 * Right-click menu for a file/dir row in the explorer: reveal it in the OS file
 * manager, copy its absolute or workspace-relative path, or open it. Wraps the
 * row element (passed as `children`) as the menu's trigger — left-click still
 * does whatever the row's own onClick does.
 */
export function FileContextMenu({
  entry,
  root,
  children,
}: {
  entry: DirEntry;
  root: FileRoot;
  children: React.ReactNode;
}) {
  const copyAbsolute = () => void copy(`${ROOT_PATH[root]}/${entry.path}`, "Path");

  const reveal = () =>
    toast(`${REVEAL_LABEL} is available in the desktop app.`);

  const openExternally = () =>
    toast("Opening files in their default app is available in the desktop app.");

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 min-w-[190px] rounded-card border border-border bg-surface p-1 text-[13px] text-text shadow-pop">
          <Item icon={<FolderOpen size={14} />} onSelect={reveal}>
            {REVEAL_LABEL}
          </Item>
          <Item icon={<Copy size={14} />} onSelect={copyAbsolute}>
            Copy path
          </Item>
          <Item icon={<Copy size={14} />} onSelect={() => void copy(entry.path, "Relative path")}>
            Copy relative path
          </Item>
          {!entry.isDir && (
            <Item icon={<ExternalLink size={14} />} onSelect={openExternally}>
              Open in default app
            </Item>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function Item({
  icon,
  children,
  onSelect,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <ContextMenu.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-default items-center gap-2 rounded-input px-2 py-1.5 outline-none",
        "data-[highlighted]:bg-surface-2",
      )}
    >
      <span className="shrink-0 text-muted">{icon}</span>
      {children}
    </ContextMenu.Item>
  );
}
