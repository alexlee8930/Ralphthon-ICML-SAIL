// Web placeholders for the desktop app's heavyweight viewers. The scientific
// 3D/astronomy/genomics renderers (3dmol / three.js) and the Office renderers
// are out of scope for the web build; each stub keeps the reference call-site
// signature and renders the reference's empty-state chrome so the inspector's
// type-switch stays structurally identical.
import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, CornerDownLeft, NotebookPen, X } from "lucide-react";
import type { NotebookCell, NotebookInspector as NotebookInspectorT, FileRoot } from "@/lib/artifacts";
import { CodeViewer } from "@/components/code-viewer/CodeViewer";
import { PaneTitlebarInset } from "./RightPane";
import { useScrollMemory } from "@/lib/scrollMemoryInspector";

/** The reference file-preview `Note` empty state. */
function StubNote({ text }: { text: string }) {
  return <div className="p-4 text-sm text-muted">{text}</div>;
}

// ---- Exotic scientific viewers (desktop-only renderers) ----

export function MoleculeView(_: { filename: string; text: string }) {
  return <StubNote text="Molecule viewer unavailable on web." />;
}

export function GenomeView(_: { filename: string; text: string }) {
  return <StubNote text="Genome viewer unavailable on web." />;
}

export function FitsView(_: { filename: string; bytes: ArrayBuffer }) {
  return <StubNote text="FITS viewer unavailable on web." />;
}

export function DosView(_: { filename: string; bytes: ArrayBuffer }) {
  return <StubNote text="DOS viewer unavailable on web." />;
}

export function BandView(_: { filename: string; bytes: ArrayBuffer }) {
  return <StubNote text="Band-structure viewer unavailable on web." />;
}

export function PhaseView(_: { filename: string; text: string }) {
  return <StubNote text="Phase-diagram viewer unavailable on web." />;
}

export function QCodeView(_: { filename: string; text: string }) {
  return <StubNote text="Qualitative-coding viewer unavailable on web." />;
}

export function AnomalyMapView(_: { filename: string; text: string }) {
  return <StubNote text="Anomaly-map viewer unavailable on web." />;
}

export function MeshView(_: { filename: string; bytes: ArrayBuffer }) {
  return <StubNote text="3D model viewer unavailable on web." />;
}

// ---- Office previews (desktop-only local JS renderers) ----

export function DocxView(_: { bytes: ArrayBuffer; scrollKey: string }) {
  return <StubNote text="Word document viewer unavailable on web." />;
}

export function XlsxView(_: { bytes: ArrayBuffer; scrollKey: string }) {
  return <StubNote text="Workbook viewer unavailable on web." />;
}

export function PptxView(_: { bytes: ArrayBuffer; scrollKey: string }) {
  return <StubNote text="Presentation viewer unavailable on web." />;
}

// ---- Notebook editor (real .ipynb files; desktop-only runnable editor) ----

export function NotebookEditor({
  path,
  onClose,
  controls,
}: {
  path: string;
  root?: FileRoot;
  onClose: () => void;
  /** Pane-level header buttons (e.g. maximize), rendered before Close. */
  controls?: React.ReactNode;
}) {
  const filename = path.split(/[\\/]/).pop() ?? path;
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <PaneTitlebarInset />
        <NotebookPen size={14} strokeWidth={1.5} className="text-text" />
        <span className="truncate text-sm font-medium text-text">{filename}</span>
        <div className="flex-1" />
        {controls}
        <button className="text-text hover:opacity-60" aria-label="Close inspector" onClick={onClose}>
          <X size={14} strokeWidth={1.5} />
        </button>
      </header>
      <StubNote text="Notebook editor unavailable on web." />
    </div>
  );
}

// ---- Notebook inspector (thread-surfaced notebook; kernel is desktop-only,
//      so evaluation degrades exactly like the reference's browser mode) ----

export function NotebookInspector({
  data,
  onClose,
  onEvaluate,
  controls,
}: {
  data: NotebookInspectorT;
  onClose: () => void;
  /** Forward the expression to the agent's live kernel (live session only). */
  onEvaluate?: (expr: string) => void;
  /** Pane-level header buttons (e.g. maximize), rendered before Close. */
  controls?: React.ReactNode;
}) {
  const [cells, setCells] = useState<NotebookCell[]>(data.cells);
  const [expr, setExpr] = useState("");
  const [busy, setBusy] = useState(false);
  // Viewing position, restored when this notebook is reopened.
  const scrollRef = useRef<HTMLDivElement>(null);
  const onScroll = useScrollMemory(scrollRef, `nb:${data.name}`);

  const evaluate = () => {
    const code = expr.trim();
    if (!code || busy) return;
    const nextIndex = (cells[cells.length - 1]?.index ?? 0) + 1;
    setCells((c) => [...c, { index: nextIndex, language: "python", code, output: "running…" }]);
    setExpr("");

    const setOutput = (output: string) =>
      setCells((c) => c.map((cell) => (cell.index === nextIndex ? { ...cell, output } : cell)));

    setBusy(true);
    try {
      // No local Python kernel on the web — forward to the agent when live.
      if (onEvaluate) {
        onEvaluate(code);
        setOutput("→ sent to the agent's kernel");
      } else {
        setOutput("(local kernel available only in the desktop app)");
      }
    } catch (e) {
      setOutput(`kernel error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      evaluate();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <PaneTitlebarInset />
        <NotebookPen size={14} strokeWidth={1.5} className="text-text" />
        <span className="text-sm font-medium text-text">Notebook</span>
        <div className="flex-1" />
        {controls}
        <button className="text-text hover:opacity-60" aria-label="Close inspector" onClick={onClose}>
          <X size={14} strokeWidth={1.5} />
        </button>
      </header>

      <div className="flex items-center gap-3 border-b border-border px-4 py-2">
        <span className="rounded-input bg-surface-2 px-2 py-1 text-sm font-medium text-text">
          {data.name}
        </span>
        <span className="text-sm text-muted">Shared with the agent</span>
        <div className="flex-1" />
        {data.live && (
          <span className="flex items-center gap-1 text-sm text-ok">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" /> Live
            <ChevronDown size={14} />
          </span>
        )}
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-4">
        {cells.map((cell) => (
          <div key={cell.index} className="mb-4">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted">
              <span className="font-mono">[{cell.index}]</span>
              <span>{cell.language}</span>
            </div>
            <CodeViewer code={cell.code} language={cell.language} startLine={1} />
            {cell.output && (
              <div className="mt-2">
                <div className="mb-1 text-xs text-muted">&gt; output</div>
                <pre className="whitespace-pre-wrap rounded-input border border-border bg-surface-2 p-3 font-mono text-[12.5px] text-text">
                  {cell.output}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>

      <footer className="border-t border-border px-4 py-3">
        <div className="text-sm font-medium text-text">{data.kernelLabel}</div>
        <div className="mt-1 mb-2 text-xs leading-relaxed text-muted">{data.kernelNote}</div>
        <div className="flex items-center gap-2 rounded-input border border-border bg-surface-2 px-3 py-2">
          <span className="font-mono text-xs text-muted">&gt;&gt;&gt;</span>
          <input
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type an expression and press Enter"
            className="flex-1 bg-transparent font-mono text-[13px] text-text outline-none placeholder:text-muted"
            aria-label="Notebook expression"
          />
          <button
            className="text-muted hover:text-text disabled:opacity-30"
            aria-label="Run expression"
            onClick={() => evaluate()}
            disabled={!expr.trim() || busy}
          >
            <CornerDownLeft size={15} />
          </button>
        </div>
      </footer>
    </div>
  );
}
