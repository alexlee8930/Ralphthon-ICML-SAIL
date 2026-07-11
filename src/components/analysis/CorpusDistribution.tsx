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
  shownVersion,
}: {
  paper: LoopPaper;
  shownVersion: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const { total, binWidth, bins } = CORPUS_DISTRIBUTION;
  const maxCount = Math.max(...bins);
  const binPx = PLOT_W / bins.length;

  const shown =
    paper.versions.find((v) => v.version === shownVersion) ??
    paper.versions[paper.versions.length - 1];
  const threshold = shown.score.selectThreshold;
  const xT = xFor(threshold);

  const points = [...paper.versions]
    .sort((a, b) => a.version - b.version)
    .map((v) => ({ version: v.version, score: v.score.score, x: xFor(v.score.score) }));

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
          aria-label={`Histogram of ${total.toLocaleString()} corpus selection scores with this paper's versions marked; v${shown.version} scored ${shown.score.score}.`}
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
            const isShown = pt.version === shown.version;
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
                    v{pt.version} · {pt.score}
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
                    v{pt.version}
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
