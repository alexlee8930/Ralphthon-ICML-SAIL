import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { PanelLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { isMacUA } from "@/lib/platform";
import { useUiStore } from "@/lib/store";
import { useLoopPaper } from "@/api/reviewLoopQueries";
import { VersionRail } from "@/app/routes/ReviewLoopPage";
import { ReviewTabs } from "@/components/analysis/ReviewTabs";
import { BottleneckDiagram } from "@/components/analysis/BottleneckDiagram";
import { CorpusDistribution } from "@/components/analysis/CorpusDistribution";
import type { LoopVersion } from "@/api/reviewLoop";

/**
 * Analysis view for a paper in the review loop: how the 3-head model produced
 * the score (the bottleneck diagram) and where the paper's versions sit in
 * the real 47k-submission training corpus (the distribution chart).
 */
export function AnalysisPage() {
  const { paperId = "" } = useParams();
  const paper = useLoopPaper(paperId);
  const [viewVersion, setViewVersion] = useState<number | null>(null);

  const { sidebarCollapsed, setSidebarCollapsed } = useUiStore();
  const isMac = isMacUA();

  const p = paper.data;
  const shown: LoopVersion | undefined = useMemo(() => {
    if (!p) return undefined;
    const v = viewVersion ?? p.currentVersion;
    return p.versions.find((x) => x.version === v);
  }, [p, viewVersion]);

  if (paper.isLoading || !p || !shown) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        {paper.error ? String(paper.error) : "Loading…"}
      </div>
    );
  }

  const selected = p.status === "selected";

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
            selected ? "bg-ok/10 text-ok ring-ok/30" : "bg-warn/10 text-warn ring-warn/30",
          )}
        >
          {selected ? "Selected" : "In review"}
        </span>
        <ReviewTabs paperId={paperId} />
        <div className="flex-1" />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[860px] flex-col gap-5 px-8 py-6">
          <VersionRail
            versions={p.versions}
            shownVersion={shown.version}
            onPick={(v) => setViewVersion(v === p.currentVersion ? null : v)}
          />
          <BottleneckDiagram version={shown} />
          <CorpusDistribution paper={p} shownVersion={shown.version} />
        </div>
      </div>
    </div>
  );
}
