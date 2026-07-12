# 53 · Analysis 화면

의존: 31-queries, 32-corpus, 51-review-loop-page(CycleRail) — 51과 상호 참조

산출 파일:

- `src/app/routes/AnalysisPage.tsx`
- `src/components/analysis/BottleneckDiagram.tsx`
- `src/components/analysis/CorpusDistribution.tsx`
- `src/components/analysis/ReviewTabs.tsx`

---

결정 난 사이클만 대상으로 하는 분석 화면. CycleRail(사이클 선택),
점수·티어, attribution 바, 레이어 병목 다이어그램, 코퍼스 분포 대비 위치,
리뷰 탭. 빈 상태(결정 전) 카피도 verbatim 유지.


---

### 파일: `src/app/routes/AnalysisPage.tsx` (94줄) — **verbatim, 글자 그대로 사용**

````tsx
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
````

### 파일: `src/components/analysis/BottleneckDiagram.tsx` (239줄) — **verbatim, 글자 그대로 사용**

````tsx
import { useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { LoopCycle } from "@/api/reviewLoop";

/**
 * Score-bottleneck diagram: manuscript → 12 backbone blocks (mean activation
 * per block, single-hue magnitude) → the scalar score read at the bottleneck
 * (block 8) → the three heads. Pure SVG; tokens only, so it holds in both
 * themes.
 */

const BARS_X = 150; // left edge of the first layer bar
const BAR_W = 18;
const NECK_W = 24; // the bottleneck bar is slightly wider
const GAP = 8;
const BASELINE = 190;
const MAX_H = 110; // bar height at activation 1
const NECK_I = 7; // block index of the bottleneck

const HEAD_X = 560;
const HEAD_W = 180;
const HEAD_H = 54;
const HEAD_YS = [30, 100, 170];

const NECK_CY = 56; // score circle center
const NECK_R = 17;

function barX(i: number): number {
  let x = BARS_X;
  for (let k = 0; k < i; k++) x += (k === NECK_I ? NECK_W : BAR_W) + GAP;
  return x;
}

export function BottleneckDiagram({ cycle }: { cycle: LoopCycle }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const s = cycle.score!;
  const selected = s.score >= s.selectThreshold;
  const neckCx = barX(NECK_I) + NECK_W / 2;
  const neckTop = BASELINE - (s.layers[NECK_I] ?? 0) * MAX_H;

  const heads: Array<{ title: string; sub: string; subFill: string }> = [
    {
      title: "Head ① Review",
      sub: `${cycle.comments.length} comments`,
      subFill: "var(--muted)",
    },
    { title: "Head ② Synthesis", sub: "meta-review", subFill: "var(--muted)" },
    {
      title: "Head ③ Decision",
      sub: `${s.gradeTier}${selected ? " · select" : " · revise"}`,
      subFill: selected ? "var(--ok)" : "var(--warn)",
    },
  ];

  const onMove = (i: number) => (e: ReactMouseEvent) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top });
  };

  return (
    <div className="rounded-card border border-border bg-surface shadow-card">
      <div className="border-b border-faint px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted">
        Score bottleneck — 3-head readout
      </div>
      <div ref={wrapRef} className="relative p-4">
        <svg
          viewBox="0 0 760 260"
          className="block h-auto w-full"
          role="img"
          aria-label={`Backbone activations for C${cycle.cycle}; the score ${s.score} is read at block 8 and feeds the review, synthesis, and decision heads.`}
        >
          {/* Baseline: manuscript → first bar → bar-to-bar */}
          <line
            x1={120}
            y1={BASELINE}
            x2={barX(11) + BAR_W}
            y2={BASELINE}
            stroke="var(--chart-grid)"
            strokeWidth={1}
          />

          {/* Manuscript node */}
          <rect
            x={20}
            y={BASELINE - 26}
            width={100}
            height={52}
            rx={10}
            fill="var(--surface-2)"
            stroke="var(--chart-axis)"
            strokeWidth={1}
          />
          <text
            x={70}
            y={BASELINE - 4}
            textAnchor="middle"
            fontSize={12}
            fontWeight={500}
            fill="var(--text)"
          >
            Manuscript
          </text>
          <text
            x={70}
            y={BASELINE + 13}
            textAnchor="middle"
            fontSize={10}
            fill="var(--muted)"
            className="font-mono"
          >
            C{cycle.cycle}
          </text>

          {/* Layer bars — single hue, light→dark = magnitude */}
          {s.layers.map((a, i) => {
            const w = i === NECK_I ? NECK_W : BAR_W;
            const h = Math.max(2, a * MAX_H);
            return (
              <rect
                key={i}
                x={barX(i)}
                width={w}
                rx={2}
                fill="var(--series-1)"
                fillOpacity={0.25 + 0.75 * a}
                style={{
                  y: BASELINE - h,
                  height: h,
                  transition: "y 300ms ease, height 300ms ease, fill-opacity 300ms ease",
                }}
              />
            );
          })}

          {/* Bottleneck: connector, score circle, label */}
          <line
            x1={neckCx}
            y1={NECK_CY + NECK_R}
            x2={neckCx}
            y2={neckTop - 4}
            stroke="var(--chart-grid)"
            strokeWidth={1}
          />
          {HEAD_YS.map((y, i) => (
            <line
              key={i}
              x1={neckCx + NECK_R}
              y1={NECK_CY}
              x2={HEAD_X}
              y2={y + HEAD_H / 2}
              stroke="var(--chart-grid)"
              strokeWidth={1}
            />
          ))}
          <circle cx={neckCx} cy={NECK_CY} r={NECK_R} fill="var(--accent)" />
          <text
            x={neckCx}
            y={NECK_CY + 4}
            textAnchor="middle"
            fontSize={12}
            fontWeight={500}
            fill="var(--accent-fg)"
            className="font-mono"
          >
            {s.score}
          </text>
          <text
            x={neckCx}
            y={BASELINE + 16}
            textAnchor="middle"
            fontSize={10}
            fill="var(--muted)"
          >
            score bottleneck · softmax
          </text>

          {/* The three heads */}
          {heads.map((h, i) => (
            <g key={h.title}>
              <rect
                x={HEAD_X}
                y={HEAD_YS[i]}
                width={HEAD_W}
                height={HEAD_H}
                rx={10}
                fill="var(--surface-2)"
                stroke="var(--chart-axis)"
                strokeWidth={1}
              />
              <text
                x={HEAD_X + 14}
                y={HEAD_YS[i] + 23}
                fontSize={12}
                fontWeight={500}
                fill="var(--text)"
              >
                {h.title}
              </text>
              <text x={HEAD_X + 14} y={HEAD_YS[i] + 40} fontSize={10} fill={h.subFill}>
                {h.sub}
              </text>
            </g>
          ))}

          {/* Hover hit targets — full column height per layer bar */}
          {s.layers.map((_, i) => (
            <rect
              key={i}
              x={barX(i)}
              y={BASELINE - MAX_H - 10}
              width={i === NECK_I ? NECK_W : BAR_W}
              height={MAX_H + 10}
              fill="transparent"
              onMouseEnter={onMove(i)}
              onMouseMove={onMove(i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute z-10 whitespace-nowrap rounded-input border border-border bg-surface px-2 py-1 text-xs text-text shadow-pop"
            style={{ left: hover.x, top: hover.y - 10, transform: "translate(-50%, -100%)" }}
          >
            block {hover.i + 1} · activation {(s.layers[hover.i] ?? 0).toFixed(2)}
          </div>
        )}

        <p className="mt-2 text-xs text-muted">
          Mean activation per backbone block · the scalar score is read at block 8 and feeds all
          three heads.
        </p>
      </div>
    </div>
  );
}
````

### 파일: `src/components/analysis/CorpusDistribution.tsx` (294줄) — **verbatim, 글자 그대로 사용**

````tsx
import { useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { LoopPaper } from "@/api/reviewLoop";
import { CORPUS_DISTRIBUTION } from "@/data/corpusDistribution";

/**
 * Where this paper sits in the real training corpus: a √-scaled histogram of
 * 47,209 selection scores with the tier medians, the selection band, and the
 * paper's version trajectory as directly-labeled accent dots on the baseline.
 */

const PLOT_L = 20;
const PLOT_R = 740;
const PLOT_W = PLOT_R - PLOT_L;
const TOP = 34; // top of the selection band / hover columns
const BASE = 196; // x-axis baseline
const BAR_MAX_H = 126; // tallest bar (√-scaled)
const TIER_LINE_TOP = 64;

const xFor = (score: number) => PLOT_L + (score / 100) * PLOT_W;

/** Bar with 2.5px rounded top corners, anchored square to the baseline. */
function topRoundedBar(x: number, w: number, h: number): string {
  const r = Math.min(2.5, h / 2, w / 2);
  const top = BASE - h;
  return [
    `M${x},${BASE}`,
    `V${top + r}`,
    `Q${x},${top} ${x + r},${top}`,
    `H${x + w - r}`,
    `Q${x + w},${top} ${x + w},${top + r}`,
    `V${BASE}`,
    "Z",
  ].join(" ");
}

const TIERS: Array<{ label: string; median: number }> = [
  { label: "reject", median: CORPUS_DISTRIBUTION.tierMedians.reject },
  { label: "poster", median: CORPUS_DISTRIBUTION.tierMedians.poster },
  { label: "spotlight", median: CORPUS_DISTRIBUTION.tierMedians.spotlight },
  { label: "oral", median: CORPUS_DISTRIBUTION.tierMedians.oral },
  { label: "top-5%", median: CORPUS_DISTRIBUTION.tierMedians["notable-top-5%"] },
];

export function CorpusDistribution({
  paper,
  shownCycle,
}: {
  paper: LoopPaper;
  shownCycle: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const { total, binWidth, bins } = CORPUS_DISTRIBUTION;
  const maxCount = Math.max(...bins);
  const binPx = PLOT_W / bins.length;

  // Only decided cycles have a score to place on the distribution.
  const scored = paper.cycles.filter((c) => c.score);
  const shown = scored.find((c) => c.cycle === shownCycle) ?? scored[scored.length - 1];
  const threshold = shown.score!.selectThreshold;
  const xT = xFor(threshold);

  const points = [...scored]
    .sort((a, b) => a.cycle - b.cycle)
    .map((c) => ({ version: c.cycle, score: c.score!.score, x: xFor(c.score!.score) }));

  const onMove = (i: number) => (e: ReactMouseEvent) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const hoverBin = hover
    ? {
        lo: hover.i * binWidth,
        hi: hover.i * binWidth + binWidth,
        count: bins[hover.i],
        pct: (bins[hover.i] / total) * 100,
      }
    : null;

  return (
    <div className="rounded-card border border-border bg-surface shadow-card">
      <div className="border-b border-faint px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted">
        Where this paper sits — {total.toLocaleString()} real submissions
      </div>
      <div ref={wrapRef} className="relative p-4">
        <svg
          viewBox="0 0 760 240"
          className="block h-auto w-full"
          role="img"
          aria-label={`Histogram of ${total.toLocaleString()} corpus selection scores with this paper's cycles marked; C${shown.cycle} scored ${shown.score!.score}.`}
        >
          {/* Selection band: threshold → 100 */}
          <rect
            x={xT}
            y={TOP}
            width={PLOT_R - xT}
            height={BASE - TOP}
            fill="var(--ok)"
            fillOpacity={0.08}
          />

          {/* Recessive vertical gridlines at the ticks */}
          {[20, 40, 60, 80].map((t) => (
            <line
              key={t}
              x1={xFor(t)}
              y1={BASE - BAR_MAX_H}
              x2={xFor(t)}
              y2={BASE}
              stroke="var(--chart-grid)"
              strokeWidth={1}
            />
          ))}

          {/* Histogram bars — √-scaled counts, 2px gaps, rounded tops */}
          {bins.map((count, i) => {
            if (count <= 0) return null;
            const h = BAR_MAX_H * Math.sqrt(count / maxCount);
            const x = xFor(i * binWidth) + 1;
            return (
              <path
                key={i}
                d={topRoundedBar(x, binPx - 2, h)}
                fill="var(--chart-axis)"
                fillOpacity={0.55}
              />
            );
          })}

          {/* Tier medians — dashed ticks, directly labeled, staggered heights */}
          {TIERS.map((t, i) => {
            const x = xFor(t.median);
            const labelY = i % 2 === 0 ? 60 : 48;
            return (
              <g key={t.label}>
                <line
                  x1={x}
                  y1={TIER_LINE_TOP}
                  x2={x}
                  y2={BASE}
                  stroke="var(--chart-axis)"
                  strokeWidth={1}
                  strokeDasharray="2 3"
                />
                <text x={x} y={labelY} textAnchor="middle" fontSize={10} fill="var(--muted)">
                  {t.label}
                </text>
              </g>
            );
          })}

          {/* Selection threshold — dashed ok line, directly labeled */}
          <line
            x1={xT}
            y1={TOP}
            x2={xT}
            y2={BASE}
            stroke="var(--ok)"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
          <text x={xT + 5} y={28} fontSize={10} fill="var(--text)">
            select ≥ {threshold}
          </text>

          {/* Axis */}
          <line
            x1={PLOT_L}
            y1={BASE}
            x2={PLOT_R}
            y2={BASE}
            stroke="var(--chart-axis)"
            strokeWidth={1}
          />
          {[0, 20, 40, 60, 80, 100].map((t) => (
            <text
              key={t}
              x={xFor(t)}
              y={214}
              textAnchor="middle"
              fontSize={10}
              fill="var(--muted)"
            >
              {t}
            </text>
          ))}

          {/* Version trajectory — accent line with arrowheads, left→right */}
          {points.slice(1).map((pt, i) => {
            const prev = points[i];
            const dir = Math.sign(pt.x - prev.x) || 1;
            const mx = (prev.x + pt.x) / 2;
            return (
              <g key={pt.version}>
                <line
                  x1={prev.x}
                  y1={BASE}
                  x2={pt.x}
                  y2={BASE}
                  stroke="var(--accent)"
                  strokeWidth={1.5}
                />
                <polygon
                  points={`${mx + 4 * dir},${BASE} ${mx - 3 * dir},${BASE - 3.5} ${mx - 3 * dir},${BASE + 3.5}`}
                  fill="var(--accent)"
                />
              </g>
            );
          })}

          {/* Version dots — accent with a 2px surface ring, directly labeled */}
          {points.map((pt) => {
            const isShown = pt.version === shown.cycle;
            return (
              <g key={pt.version}>
                <circle
                  cx={pt.x}
                  cy={BASE}
                  r={isShown ? 7 : 5}
                  fill="var(--accent)"
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
                {isShown ? (
                  <text
                    x={pt.x}
                    y={BASE - 14}
                    textAnchor="middle"
                    fontSize={11}
                    fill="var(--text)"
                    stroke="var(--surface)"
                    strokeWidth={3}
                    strokeLinejoin="round"
                    style={{ paintOrder: "stroke" }}
                    className="font-mono"
                  >
                    C{pt.version} · {pt.score}
                  </text>
                ) : (
                  <text
                    x={pt.x}
                    y={BASE - 11}
                    textAnchor="middle"
                    fontSize={10}
                    fill="var(--muted)"
                    stroke="var(--surface)"
                    strokeWidth={3}
                    strokeLinejoin="round"
                    style={{ paintOrder: "stroke" }}
                  >
                    C{pt.version}
                  </text>
                )}
              </g>
            );
          })}

          {/* Hover hit targets — full column height per bin */}
          {bins.map((_, i) => (
            <rect
              key={i}
              x={xFor(i * binWidth)}
              y={TOP}
              width={binPx}
              height={BASE - TOP}
              fill="transparent"
              onMouseEnter={onMove(i)}
              onMouseMove={onMove(i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>

        {hover && hoverBin && (
          <div
            className="pointer-events-none absolute z-10 whitespace-nowrap rounded-input border border-border bg-surface px-2 py-1 text-xs text-text shadow-pop"
            style={{ left: hover.x, top: hover.y - 10, transform: "translate(-50%, -100%)" }}
          >
            score {hoverBin.lo}–{hoverBin.hi} · {hoverBin.count.toLocaleString()} papers ·{" "}
            {hoverBin.count > 0 && hoverBin.pct < 0.1 ? "<0.1" : hoverBin.pct.toFixed(1)}%
          </div>
        )}

        <p className="mt-2 text-xs text-muted">
          Distribution of selection scores across the ICLR/ICML/NeurIPS/UAI training corpus
          (2018–2026), √-scaled counts. Tier lines mark real median scores.
        </p>
      </div>
    </div>
  );
}
````

### 파일: `src/components/analysis/ReviewTabs.tsx` (21줄) — **verbatim, 글자 그대로 사용**

````tsx
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/cn";

const PILL_BASE = "rounded-full px-2.5 py-1 text-xs transition-colors";
const pill = ({ isActive }: { isActive: boolean }) =>
  cn(PILL_BASE, isActive ? "bg-surface-2 text-text" : "text-muted hover:text-text");

/** Review ↔ Analysis switcher pills, shared by the loop view and the
 *  analysis page headers. */
export function ReviewTabs({ paperId }: { paperId: string }) {
  return (
    <nav aria-label="Paper views" className="flex shrink-0 items-center gap-1">
      <NavLink to={`/review/${paperId}`} end className={pill}>
        Review
      </NavLink>
      <NavLink to={`/review/${paperId}/analysis`} className={pill}>
        Analysis
      </NavLink>
    </nav>
  );
}
````
