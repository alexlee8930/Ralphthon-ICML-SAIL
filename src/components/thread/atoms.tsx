import { Loader2, Paperclip } from "lucide-react";
import type {
  ArtifactBlock,
  DataTableBlock,
  RunningJobsBlock,
  ScoreReportBlock,
  StatusLineBlock,
  UserMessageBlock,
} from "./blocks-thread";
import { cn } from "@/lib/cn";
import { MarkdownViewer } from "./MarkdownViewer-thread";

export function UserMessage({ block }: { block: UserMessageBlock }) {
  return (
    <div className="rounded-card bg-surface-2 px-4 py-3 text-[15px] leading-relaxed text-text">
      {block.text}
    </div>
  );
}

/** A minimal artifact block for a file referenced in prose (path only, no inline content). */
function refToArtifactBlock(path: string): ArtifactBlock {
  const filename = path.split(/[\\/]/).pop() || path;
  return { kind: "artifact", path, filename, artifact: "data", tool: "output" };
}

export function AgentMessage({
  markdown,
  onOpenArtifact,
}: {
  markdown: string;
  onOpenArtifact?: (a: ArtifactBlock) => void;
}) {
  // In the desktop build, files the agent mentions become clickable chips by
  // resolving each mention against the workspace on disk. The web build has no
  // workspace filesystem, so no mention ever resolves — the chip row stays
  // empty; the markup below keeps the reference structure unchanged.
  const refs: string[] = [];
  return (
    <div>
      <MarkdownViewer>{markdown}</MarkdownViewer>
      {refs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {refs.map((path) => (
            <button
              key={path}
              onClick={() => onOpenArtifact?.(refToArtifactBlock(path))}
              className="flex items-center gap-1.5 rounded-input border border-border bg-surface px-2 py-1 text-xs text-text hover:bg-surface-2"
              title={`Preview ${path}`}
            >
              <Paperclip size={12} className="text-accent" />
              <span className="font-mono">{path.split(/[\\/]/).pop()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DataTable({ block }: { block: DataTableBlock }) {
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface shadow-card">
      {block.caption && (
        <div className="border-b border-border px-4 py-2 text-xs text-muted">{block.caption}</div>
      )}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            {block.columns.map((c) => (
              <th key={c} className="px-4 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={cn(
                    "px-4 py-2 text-text",
                    j === row.length - 1 && "font-mono text-[13px] text-link",
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RunningJobsOverlay({ block }: { block: RunningJobsBlock }) {
  return (
    <div className="rounded-card border border-border bg-surface shadow-card">
      <div className="border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted">
        {block.title}
      </div>
      <ul className="divide-y divide-border/60">
        {block.jobs.map((j, i) => (
          <li key={i} className="flex items-center gap-2 px-4 py-2 text-sm">
            <Loader2 size={13} className="animate-spin text-accent" />
            <span className="flex-1 truncate text-text">{j.label}</span>
            <span className="text-xs text-muted">{j.elapsed}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TONE: Record<NonNullable<StatusLineBlock["tone"]>, string> = {
  running: "text-accent",
  done: "text-ok",
  review: "text-muted",
  error: "text-error",
};

export function StatusLine({ block }: { block: StatusLineBlock }) {
  return (
    <div className={cn(block.divider && "border-t border-border pt-4")}>
      <div className={cn("flex items-center gap-2 text-sm", TONE[block.tone ?? "review"])}>
        <Loader2
          size={14}
          className={cn(block.tone === "running" && "animate-spin", block.tone !== "running" && "hidden")}
        />
        <span>{block.text}</span>
      </div>
    </div>
  );
}

/** Ralph S4/S5 score + decision, in the reference's card/metric styling
 *  (card chrome from the jobs overlay, table cells from DataTable). */
export function ScoreReportCard({ block }: { block: ScoreReportBlock }) {
  const s = block.score;
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface shadow-card">
      <div className="border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted">
        Score report
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 py-3 text-sm">
        <div>
          <span className="text-muted">Decision </span>
          <span className={cn("font-medium", s.decision === "accept" ? "text-ok" : "text-error")}>
            {s.decision}
          </span>
        </div>
        <div>
          <span className="text-muted">Grade tier </span>
          <span className="font-medium text-text">{s.gradeTier}</span>
        </div>
        <div>
          <span className="text-muted">Selectivity </span>
          <span className="font-mono text-[13px] text-link">{s.selectivity.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-muted">Award proximity </span>
          <span className="font-mono text-[13px] text-link">{s.awardProximity.toFixed(2)}</span>
        </div>
      </div>
      {s.attributions.length > 0 && (
        <table className="w-full border-collapse border-t border-border text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-2 font-medium">Feature</th>
              <th className="px-4 py-2 font-medium">Weight</th>
            </tr>
          </thead>
          <tbody>
            {s.attributions.map((a, i) => (
              <tr key={i} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2 text-text">{a.feature}</td>
                <td
                  className={cn(
                    "px-4 py-2 font-mono text-[13px]",
                    a.weight >= 0 ? "text-ok" : "text-error",
                  )}
                >
                  {a.weight >= 0 ? `+${a.weight.toFixed(2)}` : a.weight.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
