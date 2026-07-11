// Visual thread-block types for the session thread area.
// Ported verbatim from the reference `@ai4s/shared` (MIT — see
// LICENSES/open-science-MIT.txt), plus the Ralph-specific score-report block.
import type { ScoreReport } from "@/api/types";

// ---- Thread blocks (center pane) ----

export type ThreadBlock =
  | UserMessageBlock
  | AgentMessageBlock
  | StepSummaryBlock
  | ToolCallBlock
  | ReviewerBlock
  | DataTableBlock
  | FigureBlock
  | ArtifactBlock
  | RunningJobsBlock
  | StatusLineBlock
  | ScoreReportBlock;

export interface UserMessageBlock {
  kind: "user";
  text: string;
}

export interface AgentMessageBlock {
  kind: "agent";
  /** Markdown; inline `code` tokens are rendered as blue mono. */
  markdown: string;
}

export interface StepSummaryBlock {
  kind: "step-summary";
  summary: string;
  steps: number;
  details?: string[];
}

export type ToolCallStatus =
  | "pending"
  | "running"
  | "waiting-approval"
  | "success"
  | "warning"
  | "failed";

/** Closed vocabulary — never derived from LLM/tool output. */
export type ToolVerb = "Ran" | "Created" | "Edited" | "Read" | "Searched" | "Listed" | "Fetched";

export interface ToolCallBlock {
  kind: "tool-call";
  /** What to recognize the step by: a de-noised command, a file path, a
   *  pattern — never the raw `cd … && …` line (that lives in `command`). */
  title: string;
  status: ToolCallStatus;
  /** Right-aligned meta, e.g. "142 lines of output" or "16m 2s". */
  meta?: string;
  /** Display verb rendered before the title ("Ran", "Created", "Edited"…). */
  verb?: ToolVerb;
  /** Tool name ("bash", "write", …) — picks the detail renderer. */
  tool?: string;
  /** Full command line as executed (bash) — shown in the expanded detail. */
  command?: string;
  filePath?: string;
  /** Written file content (write tools), for the inline detail view. */
  content?: string;
  /** Unified diff (edit tools), for the inline detail view. */
  diff?: string;
  /** Live stdout tail while the tool is running (already \r-folded + capped). */
  partialOutput?: string;
  /** Final output, for the expanded detail view. */
  output?: string;
  /** Epoch ms — drive the elapsed timer (running) and duration meta (done). */
  startedAt?: number;
  endedAt?: number;
  /** Output of a user-typed "!" command — its detail view opens by default. */
  outputSummary?: string;
  /** Subagent session spawned by this task tool — lets the UI show its live activity. */
  childSessionId?: string;
}

export type FindingLevel = "warn" | "ok" | "error";

export type ReviewCheck = "citation" | "number" | "figure" | "domain" | "integrity";

export interface ReviewFinding {
  level: FindingLevel;
  title: string;
  /** Monospace evidence body. */
  evidence?: string;
  check?: ReviewCheck;
  /** Freeform label shown on the card, overriding the check name. */
  tag?: string;
}

export interface ReviewerBlock {
  kind: "reviewer";
  findings: ReviewFinding[];
  note?: string;
}

export interface DataTableBlock {
  kind: "table";
  columns: string[];
  /** Cells rendered with mono where they look code-like. */
  rows: string[][];
  caption?: string;
}

export interface FigureBlock {
  kind: "figure";
  title: string;
  /** Image URL / data URI. */
  src: string;
  caption?: string;
  /** Reviewer/user pins dropped on the figure. */
  annotations?: FigureAnnotation[];
}

export interface FigureAnnotation {
  index: number;
  note: string;
  /** Percent position of the pin within the image. */
  x: number;
  y: number;
}

/** File the agent produced, surfaced as a traceable artifact in the thread. */
export type ArtifactKind =
  | "figure"
  | "script"
  | "report"
  | "table"
  | "notebook"
  | "model"
  | "data";

export interface ArtifactBlock {
  kind: "artifact";
  /** Workspace-relative path the tool wrote. */
  path: string;
  filename: string;
  artifact: ArtifactKind;
  /** Tool that produced it, e.g. "write" / "edit". */
  tool: string;
  /** Text content when the producing tool carried it; absent for binary. */
  content?: string;
  language?: string;
}

export interface RunningJob {
  label: string;
  elapsed: string;
}

export interface RunningJobsBlock {
  kind: "running-jobs";
  title: string; // e.g. "REMOTE · 8"
  jobs: RunningJob[];
}

export interface StatusLineBlock {
  kind: "status-line";
  text: string; // e.g. "8 running · 16m 2s"
  tone?: "running" | "done" | "review" | "error";
  divider?: boolean;
}

/** Ralph S4/S5 score + decision, rendered as a metric card in the thread. */
export interface ScoreReportBlock {
  kind: "score-report";
  score: ScoreReport;
}

// ---- Example (read-only replay) sessions ----

export type SessionGroup = "Examples" | "Today" | "Active" | "Earlier";

export interface ExampleSession {
  id: string;
  projectId: string;
  title: string;
  group: SessionGroup;
  /** Optional right-aligned count badge. */
  badge?: number;
  /** Status dot color hint. */
  status?: "idle" | "running" | "done" | "warn";
  blocks: ThreadBlock[];
  inspector?: unknown;
}
