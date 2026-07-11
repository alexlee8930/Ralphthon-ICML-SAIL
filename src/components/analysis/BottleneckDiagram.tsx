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
