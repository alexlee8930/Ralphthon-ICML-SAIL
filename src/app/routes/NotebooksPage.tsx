import { useEffect, useRef, useState } from "react";
import { ChevronDown, NotebookPen, Plus } from "lucide-react";
import { isTauri } from "@/lib/platform";
import { NotebookEditor } from "@/components/notebook/NotebookEditor";

/** A workspace .ipynb surfaced in the global list. */
interface NotebookEntry {
  /** Base-relative path. */
  path: string;
  /** Epoch seconds of last modification. */
  modified: number;
}

const NOW = Math.floor(Date.now() / 1000);

// The desktop app listed real .ipynb files under the base folder. The web build
// serves this static set, newest first, matching the artifact tree on the Files
// page.
const NOTEBOOKS: NotebookEntry[] = [
  { path: "cross-species-atlas/analysis.ipynb", modified: NOW - 3 * 3600 },
  { path: "uncertainty-curriculum/score_calibration.ipynb", modified: NOW - 26 * 3600 },
  { path: "retrieval-heads/head_ablation.ipynb", modified: NOW - 5 * 86_400 },
];

/**
 * Notebooks are real .ipynb files that live beside each review. This page is
 * GLOBAL: it lists every notebook across the paper folders, newest first.
 * Creation is a desktop-only capability, so its control is present but disabled
 * on the web (matching the reference), and notebooks open read-only.
 */
export function NotebooksPage() {
  const [entries] = useState<NotebookEntry[]>(NOTEBOOKS);
  const [open, setOpen] = useState<{ path: string; root: "workspace" | "base" } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the kernel menu on any outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const createNew = () => setMenuOpen(false);

  if (open) {
    return (
      <NotebookEditor
        path={open.path}
        root={open.root}
        onBack={() => setOpen(null)}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-8 py-6">
        <div className="flex items-center gap-3">
          <h1 className="font-serif text-xl text-text">Notebooks</h1>
          <div className="flex-1" />
          <div className="relative" ref={menuRef}>
            <button
              className="flex items-center gap-1.5 rounded-input bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
              onClick={() => setMenuOpen((v) => !v)}
              disabled={!isTauri}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <Plus size={13} /> New notebook <ChevronDown size={12} className="opacity-80" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-card border border-border bg-surface py-1 shadow-lg"
              >
                <button
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text hover:bg-surface-2"
                  onClick={createNew}
                >
                  <NotebookPen size={13} className="text-muted" /> Python notebook
                </button>
                <button
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text hover:bg-surface-2"
                  onClick={createNew}
                >
                  <NotebookPen size={13} className="text-muted" /> R notebook
                </button>
              </div>
            )}
          </div>
        </div>
        <p className="mt-1 text-sm text-muted">
          All Jupyter notebooks across your review folders, newest first. Cells run on the local Python or R kernel
          in the notebook's own folder; the agent works on the same files.
        </p>

        <div className="mt-5 space-y-1.5">
          {entries.length === 0 && (
            <div className="rounded-card border border-border bg-surface p-5 text-sm text-muted">
              Notebooks are available in the desktop app.
            </div>
          )}
          {entries.map((e) => {
            const slash = e.path.lastIndexOf("/");
            const folder = slash >= 0 ? e.path.slice(0, slash) : "";
            const name = slash >= 0 ? e.path.slice(slash + 1) : e.path;
            return (
              <button
                key={e.path}
                onClick={() => setOpen({ path: e.path, root: "base" })}
                className="flex w-full items-center gap-2.5 rounded-card border border-border bg-surface px-4 py-2.5 text-left hover:bg-surface-2"
              >
                <NotebookPen size={15} className="shrink-0 text-muted" />
                <span className="truncate text-sm text-text">{name}</span>
                {folder && (
                  <span className="max-w-[40%] truncate rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
                    {folder}
                  </span>
                )}
                <span className="ml-auto shrink-0 text-xs text-muted">
                  {new Date(e.modified * 1000).toLocaleString("en")}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
