import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRecoilValue } from "recoil";
import { ExternalLink, X } from "lucide-react";
import { INSPECTOR_MAX, INSPECTOR_MIN, manuscriptHighlightState, useUiStore } from "@/lib/store";
import { cn } from "@/lib/cn";
import type { LoopVersion } from "@/api/reviewLoop";

/**
 * Right-hand manuscript pane for the review loop — the reference
 * right-inspector pattern. Shows the manuscript of the version currently
 * selected in the version rail: pasted text renders as readable serif prose;
 * PDF uploads render in an iframe. Width comes from the shared ui-store
 * inspector width (persisted), resizable via the left-edge drag handle within
 * [INSPECTOR_MIN, INSPECTOR_MAX]; the header X closes the pane.
 */
/** Wrap every occurrence of each phrase in a paragraph with <mark>. Exact
 *  substring matching via indexOf loops (no regex, so no escaping bugs);
 *  matches are non-overlapping and the earliest split wins. Returns the
 *  paragraph as plain string when nothing matches. */
function highlightPhrases(paragraph: string, phrases: string[]): ReactNode {
  const spans: Array<{ start: number; end: number }> = [];
  for (const phrase of phrases) {
    if (!phrase) continue;
    let from = 0;
    for (;;) {
      const at = paragraph.indexOf(phrase, from);
      if (at === -1) break;
      spans.push({ start: at, end: at + phrase.length });
      from = at + phrase.length;
    }
  }
  if (spans.length === 0) return paragraph;

  // Earliest start wins; on ties the longer match wins. Drop overlaps.
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Array<{ start: number; end: number }> = [];
  let lastEnd = 0;
  for (const s of spans) {
    if (s.start >= lastEnd) {
      kept.push(s);
      lastEnd = s.end;
    }
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  kept.forEach((s, i) => {
    if (s.start > cursor) nodes.push(paragraph.slice(cursor, s.start));
    nodes.push(
      <mark key={i} className="rounded-sm bg-accent/15 px-0.5 text-text ring-1 ring-accent/30">
        {paragraph.slice(s.start, s.end)}
      </mark>,
    );
    cursor = s.end;
  });
  if (cursor < paragraph.length) nodes.push(paragraph.slice(cursor));
  return nodes;
}

/** Dependency-free markdown-lite: #/##/### headings, --- rules, paragraphs.
 *  Enough to make pasted papers and the appended revision notes read like a
 *  manuscript instead of raw markup; everything else stays pre-wrapped.
 *  Attribution-evidence phrases (Recoil manuscriptHighlightState) render as
 *  <mark> inside body paragraphs; the first match auto-scrolls into view. */
function ManuscriptText({ text }: { text: string }) {
  const highlight = useRecoilValue(manuscriptHighlightState);
  const rootRef = useRef<HTMLDivElement>(null);

  // When the hovered feature changes, center the first rendered match.
  useEffect(() => {
    if (!highlight) return;
    const first = rootRef.current?.querySelector("mark");
    first?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlight]);

  const phrases = highlight?.phrases ?? [];
  const blocks = text.split(/\n{2,}/);
  return (
    <div ref={rootRef} className="flex flex-col gap-3 font-serif text-[15px] leading-relaxed text-text">
      {blocks.map((block, i) => {
        const t = block.trim();
        if (t === "---") return <hr key={i} className="border-faint" />;
        if (t.startsWith("### "))
          return (
            <h3 key={i} className="mt-2 text-[15px] font-semibold tracking-tight">
              {t.slice(4)}
            </h3>
          );
        if (t.startsWith("## "))
          return (
            <h2 key={i} className="mt-3 text-[17px] font-semibold tracking-tight">
              {t.slice(3)}
            </h2>
          );
        if (t.startsWith("# "))
          return (
            <h1 key={i} className="text-[21px] font-semibold tracking-tight">
              {t.slice(2)}
            </h1>
          );
        return (
          <p key={i} className="whitespace-pre-wrap">
            {phrases.length > 0 ? highlightPhrases(block, phrases) : block}
          </p>
        );
      })}
    </div>
  );
}

export function ManuscriptPane({ version }: { version: LoopVersion }) {
  const { inspectorWidth, setInspectorWidth, setInspectorOpen } = useUiStore();
  // Live width during a drag; the store (and localStorage) only update on
  // pointer-up — same contract as the reference RightPane.
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const dragging = dragWidth !== null;

  const clamp = (w: number) => Math.max(INSPECTOR_MIN, Math.min(INSPECTOR_MAX, w));

  const onHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragWidth(inspectorWidth);
  };
  const onHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    // The pane ends at the window's right edge, so the width is whatever is
    // right of the pointer.
    setDragWidth(clamp(window.innerWidth - e.clientX));
  };
  const onHandlePointerUp = () => {
    if (!dragging) return;
    setInspectorWidth(dragWidth);
    setDragWidth(null);
  };

  const m = version.manuscript;

  return (
    <div
      className="relative flex h-full shrink-0 flex-col border-l border-faint bg-surface"
      style={{ width: dragWidth ?? inspectorWidth }}
    >
      {/* Left-edge drag handle: resize within [INSPECTOR_MIN, INSPECTOR_MAX]. */}
      <div
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerUp}
        className={cn(
          "absolute inset-y-0 left-0 z-10 w-1 cursor-col-resize transition-colors hover:bg-accent/40",
          dragging && "bg-accent/40",
        )}
      />

      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-faint px-4">
        <span className="text-[13px] font-medium text-text">Manuscript</span>
        <span className="shrink-0 rounded-full border border-border bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted">
          v{version.version}
        </span>
        {m.fileName && (
          <span className="min-w-0 truncate text-xs text-muted">{m.fileName}</span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setInspectorOpen(false)}
          aria-label="Close manuscript"
          title="Close manuscript"
          className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {m.kind === "pdf" ? (
          m.url ? (
            <div className="flex h-full flex-col">
              {/* Inline preview needs the browser PDF viewer; the link covers
                  environments where it's unavailable. */}
              <div className="flex shrink-0 items-center justify-end border-b border-faint px-4 py-1.5">
                <a
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted hover:text-text"
                >
                  <ExternalLink size={12} />
                  Open in new tab
                </a>
              </div>
              <iframe title="manuscript" src={m.url} className="min-h-0 w-full flex-1 border-0" />
            </div>
          ) : (
            <div className="px-6 py-5 text-sm text-muted">
              The PDF for this version isn't available to preview.
            </div>
          )
        ) : (
          <div className="h-full overflow-y-auto">
            <div className="px-6 py-5">
              {m.text ? (
                <ManuscriptText text={m.text} />
              ) : (
                <span className="font-sans text-sm text-muted">
                  This version has no manuscript text.
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
