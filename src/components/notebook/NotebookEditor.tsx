import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, History, Loader2, NotebookPen, RefreshCw, X } from "lucide-react";
import type { NotebookCell } from "@/lib/artifacts";
import { ProvenancePanel } from "@/components/inspector/ProvenancePanel";
import { PaneTitlebarInset } from "@/components/inspector/RightPane";
import { cn } from "@/lib/cn";

type NotebookLanguage = "python" | "r";

/**
 * Read-only viewer for a workspace .ipynb. On the desktop this was a runnable
 * editor backed by a local kernel; the web build has no kernel or filesystem
 * bridge, so this renders a visually-identical shell — same header, cell
 * chrome, outputs, and history panel — over deterministic demo content. Used
 * full-page (Notebooks page) and as the right-pane preview (Files page).
 */
export function NotebookEditor({
  path,
  root,
  onBack,
  onClose,
  controls,
}: {
  path: string;
  /** Folder tree `path` resolves in (default the active workspace). */
  root?: "workspace" | "base";
  /** Back navigation (full-page use). */
  onBack?: () => void;
  /** Close the pane (inspector use). */
  onClose?: () => void;
  /** Pane-level header buttons (e.g. maximize), rendered before Close. */
  controls?: React.ReactNode;
}) {
  const [cells, setCells] = useState<NotebookCell[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const language: NotebookLanguage = /notebook-r|(^|[\\/])r[-_.]/i.test(path) ? "r" : "python";

  const load = useCallback(() => {
    setError(null);
    setCells(null);
    // Mimic the reference's async read so the loading state renders identically.
    const id = window.setTimeout(() => setCells(demoCells(language)), 120);
    return () => window.clearTimeout(id);
  }, [language]);

  useEffect(() => load(), [load]);

  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex h-full flex-col" data-root={root}>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <PaneTitlebarInset />
        {onBack && (
          <button className="text-text hover:opacity-60" aria-label="Back to notebooks" onClick={onBack}>
            <ArrowLeft size={14} strokeWidth={1.5} />
          </button>
        )}
        <NotebookPen size={14} strokeWidth={1.5} className="shrink-0 text-text" />
        <h1 className="truncate text-[13px] font-medium text-text">{path}</h1>
        <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
          {language === "r" ? "R" : "Python"}
        </span>
        <span className="shrink-0 text-xs text-muted">Read-only</span>
        <div className="flex-1" />
        <span className="hidden shrink-0 text-xs text-muted xl:inline">shared with the agent</span>
        <button
          className={cn(showHistory ? "text-accent" : "text-text hover:opacity-60")}
          aria-label="History"
          title="History — every recorded version with its code and conversation"
          aria-pressed={showHistory}
          onClick={() => setShowHistory((v) => !v)}
        >
          <History size={14} strokeWidth={1.5} />
        </button>
        <button
          className="text-text hover:opacity-60"
          aria-label="Reload from disk"
          title="Reload (pick up the agent's changes)"
          onClick={() => load()}
        >
          <RefreshCw size={14} strokeWidth={1.5} />
        </button>
        {controls}
        {onClose && (
          <button className="text-text hover:opacity-60" aria-label="Close inspector" onClick={onClose}>
            <X size={14} strokeWidth={1.5} />
          </button>
        )}
      </div>

      {showHistory && (
        <div className="flex-1 overflow-y-auto bg-surface-2">
          <ProvenancePanel path={path} language={language} />
        </div>
      )}
      <div ref={scrollRef} className={cn("flex-1 overflow-y-auto", showHistory && "hidden")}>
        <div className="mx-auto max-w-3xl px-6 py-5">
          {error && <div className="text-sm text-error">{error}</div>}
          {!error && !cells && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          )}
          {cells?.map((cell) => (
            <div key={cell.index} className="group mb-4">
              <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                <span className="font-mono">[{cell.index}]</span>
                <span>{cell.language}</span>
              </div>
              <textarea
                value={cell.code}
                readOnly
                rows={Math.min(Math.max(cell.code.split("\n").length, 1), 14)}
                spellCheck={false}
                className={cn(
                  "w-full resize-none rounded-input border border-border bg-surface p-3 font-mono text-[12.5px] leading-relaxed text-text outline-none focus:border-accent/50",
                  cell.language !== "python" && cell.language !== "r" && "bg-surface-2 text-muted",
                )}
                aria-label={`Cell ${cell.index}`}
              />
              {cell.output && (
                <pre className="mt-1.5 whitespace-pre-wrap rounded-input border border-border bg-surface-2 p-3 font-mono text-[12px] text-text">
                  {cell.output}
                </pre>
              )}
              {cell.image && (
                <img
                  src={`data:image/png;base64,${cell.image}`}
                  alt={`Cell ${cell.index} figure`}
                  className="mt-1.5 max-w-full rounded-input border border-border bg-white p-2"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function demoCells(language: NotebookLanguage): NotebookCell[] {
  if (language === "r") {
    return [
      {
        index: 1,
        language: "markdown",
        code: "# Selectivity-head calibration\nReliability of the S4 scoring head across the review set.",
      },
      {
        index: 2,
        language: "r",
        code: 'scores <- read.csv("score_report.csv")\nsummary(scores$selectivity)',
        output: "   Min. 1st Qu.  Median    Mean 3rd Qu.    Max.\n 0.0400  0.4100  0.6200  0.6120  0.8100  0.9900",
      },
    ];
  }
  return [
    {
      index: 1,
      language: "markdown",
      code: "# Review scoring notebook\nExploratory analysis of the S4 selectivity head over the demo review set.",
    },
    {
      index: 2,
      language: "python",
      code: 'import pandas as pd\nscores = pd.read_csv("score_report.csv")\nscores[["selectivity", "award_proximity"]].describe()',
      output:
        "       selectivity  award_proximity\ncount   128.000000       128.000000\nmean      0.612000         0.184000\nstd       0.201000         0.142000\nmin       0.040000         0.010000\nmax       0.990000         0.870000",
    },
    {
      index: 3,
      language: "python",
      code: "ax = scores['selectivity'].hist(bins=20)\nax.set_title('Selectivity distribution')\nax.set_xlabel('score')",
      output: "<Figure size 640x480 with 1 Axes>",
    },
  ];
}
