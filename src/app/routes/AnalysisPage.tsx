import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { PanelLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { isMacUA } from "@/lib/platform";
import { useUiStore } from "@/lib/store";
import { useLoopPaper } from "@/api/reviewLoopQueries";
import { CycleRail } from "@/app/routes/ReviewLoopPage";
import { ReviewTabs } from "@/components/analysis/ReviewTabs";
import { BottleneckDiagram } from "@/components/analysis/BottleneckDiagram";
import { CorpusDistribution } from "@/components/analysis/CorpusDistribution";
import type { LoopCycle } from "@/api/reviewLoop";

/**
 * Analysis view: how the model produced a cycle's score (bottleneck diagram)
 * and where the decided cycles sit in the 47k-submission corpus. Scores only
 * exist once a cycle's meta-review is written, so the view covers decided
 * cycles; an undecided paper shows an empty state.
 */
export function AnalysisPage() {
  const { paperId = "" } = useParams();
  const paper = useLoopPaper(paperId);
  const [viewCycle, setViewCycle] = useState<number | null>(null);

  const { sidebarCollapsed, setSidebarCollapsed } = useUiStore();
  const isMac = isMacUA();

  const p = paper.data;
  const shown: LoopCycle | undefined = useMemo(() => {
    if (!p) return undefined;
    const scored = p.cycles.filter((c) => c.score);
    if (viewCycle !== null) return scored.find((c) => c.cycle === viewCycle);
    return scored[scored.length - 1];
  }, [p, viewCycle]);

  if (paper.isLoading || !p) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        {paper.error ? String(paper.error) : "Loading…"}
      </div>
    );
  }

  const accepted = p.cycles.some((c) => c.decision === "accept");

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-faint px-6">
        {sidebarCollapsed && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            aria-label="Expand sidebar"
            title={`Expand sidebar (${isMac ? "⌘B" : "Ctrl+B"})`}
            className="fade-in rounded p-1 text-text hover:bg-surface-2"
          >
            <PanelLeft size={14} strokeWidth={1.5} />
          </button>
        )}
        <h1 className="min-w-0 truncate text-[13px] font-medium text-text">{p.title}</h1>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1",
            accepted ? "bg-ok/10 text-ok ring-ok/30" : "bg-warn/10 text-warn ring-warn/30",
          )}
        >
          {accepted ? "Accepted" : "In review"}
        </span>
        <ReviewTabs paperId={paperId} />
        <div className="flex-1" />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[860px] flex-col gap-5 px-8 py-6">
          {shown ? (
            <>
              <CycleRail
                cycles={p.cycles.filter((c) => c.score)}
                shownCycle={shown.cycle}
                onPick={(n) => setViewCycle(n)}
              />
              <BottleneckDiagram cycle={shown} />
              <CorpusDistribution paper={p} shownCycle={shown.cycle} />
            </>
          ) : (
            <div className="rounded-card border border-dashed border-border px-5 py-8 text-center text-sm text-muted">
              No decided cycle yet — the score (and this analysis) appears once the Area Chair
              writes the meta-review. Finish the discussion and request the meta-review first.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
