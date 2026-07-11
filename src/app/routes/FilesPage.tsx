import { useCallback, useEffect, useState } from "react";
import {
  ChevronRight,
  Dna,
  FileText,
  Film,
  FlaskConical,
  Folder,
  Image as ImageIcon,
  Highlighter,
  Loader2,
  NotebookPen,
  Sheet,
} from "lucide-react";
import { extOf, extToKind, previewKindForName, type PreviewKind } from "@/lib/artifacts";
import { NotebookEditor } from "@/components/notebook/NotebookEditor";
import { FilePreviewInspector } from "@/components/inspector/FilePreviewInspector";
import { FileContextMenu, type DirEntry } from "@/components/files/FileContextMenu";
import { cn } from "@/lib/cn";

const EXT_LANG: Record<string, string> = {
  py: "python", r: "r", jl: "julia", sh: "bash", tex: "latex", md: "markdown",
};

function iconFor(entry: DirEntry) {
  if (entry.isDir) return <Folder size={15} className="text-accent" />;
  const kind = previewKindForName(entry.name);
  const cls = "text-muted";
  if (entry.name.endsWith(".ipynb")) return <NotebookPen size={15} className={cls} />;
  if (kind === "image" || kind === "fits" || kind === "anomaly" || kind === "phase") return <ImageIcon size={15} className={cls} />;
  if (kind === "video") return <Film size={15} className={cls} />;
  if (kind === "table") return <Sheet size={15} className={cls} />;
  if (kind === "molecule" || kind === "dos" || kind === "bands") return <FlaskConical size={15} className={cls} />;
  if (kind === "genome") return <Dna size={15} className={cls} />;
  if (kind === "qcode") return <Highlighter size={15} className={cls} />;
  return <FileText size={15} className={cls} />;
}

function humanSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function baseName(p: string | null): string {
  if (!p) return "workspace";
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

// ---- Static artifact tree ---------------------------------------------------
// The desktop app browsed the on-disk base folder that holds every session's
// dated subfolder. The web build has no filesystem bridge, so the paper/report
// artifacts (papers, reviews, figures, scores) are served from this static
// tree, keyed by base-relative directory path ("" = the base folder).

const BASE_PATH = "/workspace/papers";

const dir = (name: string, path: string): DirEntry => ({ name, path, isDir: true, size: 0 });
const file = (name: string, path: string, size: number): DirEntry => ({ name, path, isDir: false, size });

const TREE: Record<string, DirEntry[]> = {
  "": [
    dir("uncertainty-curriculum", "uncertainty-curriculum"),
    dir("retrieval-heads", "retrieval-heads"),
    dir("cross-species-atlas", "cross-species-atlas"),
  ],
  "uncertainty-curriculum": [
    dir("figures", "uncertainty-curriculum/figures"),
    file("curriculum_v2.pdf", "uncertainty-curriculum/curriculum_v2.pdf", 842_000),
    file("review_s1.md", "uncertainty-curriculum/review_s1.md", 5_210),
    file("discussion_s2.md", "uncertainty-curriculum/discussion_s2.md", 3_120),
    file("meta_review_s3.md", "uncertainty-curriculum/meta_review_s3.md", 4_020),
    file("score_report.json", "uncertainty-curriculum/score_report.json", 1_840),
    file("attributions.csv", "uncertainty-curriculum/attributions.csv", 4_120),
    file("explanation_s6.md", "uncertainty-curriculum/explanation_s6.md", 2_210),
  ],
  "uncertainty-curriculum/figures": [
    file("ablation_curve.png", "uncertainty-curriculum/figures/ablation_curve.png", 128_000),
    file("calibration.png", "uncertainty-curriculum/figures/calibration.png", 96_000),
  ],
  "retrieval-heads": [
    file("retrieval_heads.pdf", "retrieval-heads/retrieval_heads.pdf", 610_000),
    file("review_s1.md", "retrieval-heads/review_s1.md", 4_800),
    file("score_report.json", "retrieval-heads/score_report.json", 1_620),
  ],
  "cross-species-atlas": [
    file("atlas_fig1a.png", "cross-species-atlas/atlas_fig1a.png", 1_200_000),
    file("make_atlas_fig.py", "cross-species-atlas/make_atlas_fig.py", 8_123),
    file("review.pdf", "cross-species-atlas/review.pdf", 320_000),
    file("analysis.ipynb", "cross-species-atlas/analysis.ipynb", 15_400),
  ],
};

function listDir(rel: string): Promise<DirEntry[]> {
  // Directories first, then files — matching the desktop listing order.
  const entries = (TREE[rel] ?? []).slice().sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return new Promise((resolve) => window.setTimeout(() => resolve(entries), 90));
}

/**
 * GLOBAL file explorer: browses the paper/report artifact tree (papers,
 * reviews, figures, scores) across every review. Directories are navigable via
 * a breadcrumb; files open in the same viewers used elsewhere, so all past work
 * is reachable in one place.
 */
export function FilesPage() {
  const [dirPath, setDirPath] = useState(""); // base-relative; "" = the base folder
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DirEntry | null>(null);
  const basePath = BASE_PATH;

  const load = useCallback(async (rel: string) => {
    setEntries(null);
    setError(null);
    try {
      setEntries(await listDir(rel));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    void load(dirPath);
  }, [dirPath, load]);

  const open = (entry: DirEntry) => {
    if (entry.isDir) {
      setSelected(null);
      setDirPath(entry.path);
    } else {
      setSelected(entry);
    }
  };

  const crumbs = dirPath ? dirPath.split("/") : [];

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-72 shrink-0 flex-col border-r border-border">
        <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-3 py-2.5 text-[13px]">
          <button
            className={cn("rounded px-1 hover:bg-surface-2", dirPath ? "text-link" : "font-medium text-text")}
            onClick={() => setDirPath("")}
            title={basePath}
          >
            {baseName(basePath)}
          </button>
          {crumbs.map((part, i) => {
            const to = crumbs.slice(0, i + 1).join("/");
            const isLast = i === crumbs.length - 1;
            return (
              <span key={to} className="flex items-center gap-0.5">
                <ChevronRight size={13} className="text-muted" />
                <button
                  className={cn("rounded px-1 hover:bg-surface-2", isLast ? "font-medium text-text" : "text-link")}
                  onClick={() => setDirPath(to)}
                >
                  {part}
                </button>
              </span>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {entries === null && (
            <div className="flex items-center gap-2 p-2 text-sm text-muted">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          )}
          {error && <div className="p-2 text-sm text-error">{error}</div>}
          {entries && entries.length === 0 && !error && (
            <div className="p-2 text-sm text-muted">This folder is empty.</div>
          )}
          {entries?.map((entry) => (
            <FileContextMenu key={entry.path} entry={entry} root="base">
              <button
                onClick={() => open(entry)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-input px-2 py-1.5 text-left text-[13px] hover:bg-surface-2",
                  selected?.path === entry.path ? "bg-surface-2 text-text" : "text-text/90",
                )}
              >
                {iconFor(entry)}
                <span className="flex-1 truncate">{entry.name}</span>
                {!entry.isDir && <span className="shrink-0 text-[11px] text-muted">{humanSize(entry.size)}</span>}
                {entry.isDir && <ChevronRight size={14} className="shrink-0 text-muted" />}
              </button>
            </FileContextMenu>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {selected ? (
          <FilePreview key={selected.path} entry={selected} root="base" onClose={() => setSelected(null)} />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted">
            Select a file to preview it here.
          </div>
        )}
      </div>
    </div>
  );
}

function FilePreview({
  entry,
  root,
  onClose,
  controls,
}: {
  entry: DirEntry;
  root: "workspace" | "base";
  onClose: () => void;
  controls?: React.ReactNode;
}) {
  const ext = extOf(entry.name);
  if (ext === "ipynb")
    return <NotebookEditor path={entry.path} root={root} onClose={onClose} controls={controls} />;
  const kind: PreviewKind = previewKindForName(entry.name);
  return (
    <FilePreviewInspector
      data={{
        variant: "file",
        path: entry.path,
        filename: entry.name,
        artifact: extToKind(ext),
        language: EXT_LANG[ext] ?? (kind === "text" ? ext : undefined),
        root,
      }}
      onClose={onClose}
      controls={controls}
    />
  );
}
