import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSetRecoilState } from "recoil";
import {
  ArrowUp,
  Award,
  CheckCircle2,
  CircleDot,
  FileText,
  FileUp,
  Loader2,
  PanelLeft,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { isMacUA } from "@/lib/platform";
import { manuscriptHighlightState, useUiStore } from "@/lib/store";
import {
  useDeleteLoopPaper,
  useLoopPaper,
  useLoopPapers,
  useReviseLoopPaper,
  useSubmitLoopPaper,
} from "@/api/reviewLoopQueries";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ManuscriptPane } from "@/components/review/ManuscriptPane";
import { ReviewTabs } from "@/components/analysis/ReviewTabs";
import { META_REVIEW_MIN_TURNS } from "@/api/reviewLoop";
import type { CommentSeverity, LoopPaper, LoopVersion } from "@/api/reviewLoop";

/**
 * The review loop: submit a paper (title + manuscript text and/or PDF) → the
 * 3-head model scores it out of 100 → award-similar scores are SELECTED;
 * anything lower gets an AC-style review, a one-click AI revision bumps the
 * version, and the loop repeats until selection. `/review` submits;
 * `/review/:paperId` runs the loop with the manuscript of the shown version
 * in a resizable right pane (the reference inspector pattern).
 */
export function ReviewLoopPage() {
  const { paperId } = useParams();
  return paperId ? <LoopView paperId={paperId} /> : <SubmitView />;
}

/* ------------------------------------------------------------------ */
/* Submit surface                                                      */
/* ------------------------------------------------------------------ */

function SubmitView() {
  const navigate = useNavigate();
  const papers = useLoopPapers();
  const submit = useSubmitLoopPaper();
  const deletePaper = useDeleteLoopPaper();
  const [pendingDelete, setPendingDelete] = useState<LoopPaper | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const hasManuscript = text.trim().length > 0 || !!file;
  const canSubmit = title.trim().length > 0 && hasManuscript && !submit.isPending;
  const disabledReason = !title.trim()
    ? "Add a title first"
    : !hasManuscript
      ? "Paste the manuscript text or attach a PDF"
      : null;
  const onSubmit = () => {
    if (!canSubmit) return;
    submit.mutate(
      { title: title.trim(), text: text.trim() || undefined, file: file ?? undefined },
      { onSuccess: (p) => navigate(`/review/${p.id}`) },
    );
  };

  const { sidebarCollapsed, setSidebarCollapsed } = useUiStore();
  const isMac = isMacUA();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center px-6">
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
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] px-8 pb-16 pt-10">
          <div className="text-center text-xs font-medium uppercase tracking-[0.2em] text-muted">
            Paper review
          </div>
          <h1 className="mt-3 text-center font-serif text-[32px] font-semibold tracking-tight text-text">
            Get selected, faster.
          </h1>
          <p className="mt-2 text-center text-sm text-muted">
            Ralph scores your paper out of 100 the way an area chair would. Reach the
            award-similar band and you're selected — fall short and Ralph reviews, revises, and
            rescores with you until you get there.
          </p>

          <div className="mt-8 rounded-card border border-border bg-surface p-5 shadow-card">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted">
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Paper title"
              className="mt-1.5 w-full rounded-input border border-border bg-surface px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-accent"
            />
            <label className="mt-4 block text-xs font-medium uppercase tracking-wider text-muted">
              Manuscript
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the full paper text — abstract, sections, everything. The whole manuscript drives the score. (Or attach the PDF below.)"
              rows={12}
              className="mt-1.5 w-full resize-none rounded-input border border-border bg-surface px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-accent"
            />
            <div className="mt-4 flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-muted hover:text-text">
                <FileUp size={14} />
                <span>{file ? file.name : "Attach PDF"}</span>
                <input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <button
                onClick={onSubmit}
                disabled={!canSubmit}
                title={disabledReason ?? "Score my paper"}
                className="flex items-center gap-1.5 rounded-input bg-accent px-4 py-2 text-[13px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {submit.isPending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Scoring…</span>
                  </>
                ) : (
                  <>
                    <ArrowUp size={14} />
                    <span>Score my paper</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {(papers.data?.length ?? 0) > 0 && (
            <div className="mt-10">
              <div className="px-1 text-xs font-medium uppercase tracking-wider text-muted">
                Submissions
              </div>
              <div className="mt-2 flex flex-col gap-2">
                {papers.data!.map((p) => (
                  <PaperRow
                    key={p.id}
                    paper={p}
                    onOpen={() => navigate(`/review/${p.id}`)}
                    onDelete={() => setPendingDelete(p)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this submission?"
          body={`"${pendingDelete.title}" and its full version history will be permanently removed.`}
          confirmLabel="Delete"
          onConfirm={() => {
            deletePaper.mutate(pendingDelete.id);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

function PaperRow({
  paper,
  onOpen,
  onDelete,
}: {
  paper: LoopPaper;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const latest = paper.versions[paper.versions.length - 1];
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
      }}
      className="group flex cursor-pointer items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 text-left shadow-card transition-colors hover:border-accent/40"
    >
      {paper.status === "selected" ? (
        <CheckCircle2 size={16} className="shrink-0 text-ok" />
      ) : (
        <CircleDot size={16} className="shrink-0 text-warn" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-text">{paper.title}</div>
        <div className="text-xs text-muted">
          v{paper.currentVersion} · {paper.status === "selected" ? "Selected" : "In review"}
        </div>
      </div>
      <div className="font-mono text-sm text-text">
        {latest?.score.score ?? "—"}
        <span className="text-muted">/100</span>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label={`Delete "${paper.title}"`}
        title="Delete this submission"
        className="invisible shrink-0 rounded p-1 text-muted hover:text-error group-hover:visible"
      >
        <Trash2 size={15} strokeWidth={1.5} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Loop surface                                                        */
/* ------------------------------------------------------------------ */

function LoopView({ paperId }: { paperId: string }) {
  const paper = useLoopPaper(paperId);
  const revise = useReviseLoopPaper(paperId);
  const [viewVersion, setViewVersion] = useState<number | null>(null);

  const { sidebarCollapsed, setSidebarCollapsed, inspectorOpen, setInspectorOpen } = useUiStore();
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

  const isLatest = shown.version === p.currentVersion;
  const selected = p.status === "selected";
  const prev = p.versions.find((v) => v.version === shown.version - 1);
  const delta = prev ? shown.score.score - prev.score.score : null;
  const openComments = shown.comments.filter((c) => !c.resolvedInVersion);

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
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
          <button
            onClick={() => setInspectorOpen(!inspectorOpen)}
            className={cn(
              "flex items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-surface-2",
              inspectorOpen ? "text-text" : "text-muted",
            )}
            title={inspectorOpen ? "Hide the manuscript pane" : "Show the manuscript pane"}
          >
            <FileText size={13} />
            <span>Manuscript</span>
          </button>
          {isLatest && (
            <button
              onClick={() => revise.mutate()}
              disabled={revise.isPending}
              className="flex items-center gap-1.5 rounded-input bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
              title="Ralph revises the paper to address the open review, then rescores"
            >
              {revise.isPending ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Revising & rescoring…</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  <span>Revise with AI</span>
                </>
              )}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-[820px] flex-col gap-5 px-8 py-6">
            {selected && isLatest && (
              <div className="flex items-center gap-3 rounded-card border border-ok/30 bg-ok/10 px-4 py-3">
                <Award size={18} className="shrink-0 text-ok" />
                <div>
                  <div className="text-sm font-medium text-text">
                    {shown.score.gradeTier === "notable-top-5%"
                      ? "Best-paper range — the score sits in the top-5% band."
                      : "Selected — the score sits in the award-similar band."}
                  </div>
                  <div className="text-xs text-muted">
                    v{p.currentVersion} scored {shown.score.score}/100, at or above the selection
                    threshold of {shown.score.selectThreshold}. The committee keeps reviewing —
                    revise anytime to push further.
                  </div>
                </div>
              </div>
            )}

            <ScoreHero version={shown} delta={delta} />

            <VersionRail
              versions={p.versions}
              shownVersion={shown.version}
              onPick={(v) => setViewVersion(v === p.currentVersion ? null : v)}
            />

            {shown.origin === "ai_revision" && shown.changeNote && (
              <div className="rounded-card border border-border bg-surface p-4 shadow-card">
                <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted">
                  <RefreshCw size={12} />
                  What this revision changed
                </div>
                <p className="mt-2 text-sm leading-relaxed text-text">{shown.changeNote}</p>
              </div>
            )}

            <ReviewPanel version={shown} />

            <Attributions version={shown} />

            {shown.comments.length > 0 && (
              <div>
                <div className="flex items-baseline justify-between px-1">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted">
                    Review — v{shown.version}
                  </div>
                  <div className="text-xs text-muted">
                    {openComments.length} open · {shown.comments.length - openComments.length}{" "}
                    resolved
                  </div>
                </div>
                <div className="mt-2 flex flex-col gap-2.5">
                  {shown.comments.map((c) => (
                    <CommentCard key={c.id} severity={c.severity} section={c.section} body={c.body} resolvedInVersion={c.resolvedInVersion} />
                  ))}
                </div>
              </div>
            )}

            {isLatest && (
              <div className="flex items-center justify-between rounded-card border border-border bg-surface-2 px-4 py-3">
                <div className="text-xs text-muted">
                  {selected
                    ? `Selected doesn't end the loop — Ralph keeps applying the open review, uploads v${p.currentVersion + 1}, and rescores toward the best-paper band.`
                    : `Ralph applies the open review to the manuscript, uploads it as v${p.currentVersion + 1}, and rescores — the loop runs until selection.`}
                </div>
                <button
                  onClick={() => revise.mutate()}
                  disabled={revise.isPending}
                  className="ml-4 flex shrink-0 items-center gap-1.5 rounded-input bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {revise.isPending ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Sparkles size={13} />
                  )}
                  <span>
                    {revise.isPending ? "Working…" : `Revise with AI → v${p.currentVersion + 1}`}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* The manuscript of the version shown in the rail — reference
          right-inspector pattern, resizable, closable from its header. */}
      {inspectorOpen && <ManuscriptPane version={shown} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function ScoreHero({ version, delta }: { version: LoopVersion; delta: number | null }) {
  const s = version.score;
  const pct = Math.min(100, Math.max(0, s.score));
  return (
    <div className="rounded-card border border-border bg-surface p-5 shadow-card">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted">
            Selection score · v{version.version}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-serif text-[44px] font-semibold leading-none tracking-tight text-text">
              {s.score}
            </span>
            <span className="text-lg text-muted">/ 100</span>
            {delta !== null && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 font-mono text-[11px]",
                  delta >= 0 ? "bg-ok/10 text-ok" : "bg-error/10 text-error",
                )}
              >
                {delta >= 0 ? "+" : ""}
                {delta} vs v{version.version - 1}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted">Predicted tier</div>
          <div className="mt-0.5 text-sm font-medium text-text">{s.gradeTier}</div>
        </div>
      </div>

      {/* Score bar with the award-similar selection threshold tick. */}
      <div className="relative mt-5 h-2 rounded-full bg-surface-2">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            pct >= s.selectThreshold ? "bg-ok" : "bg-accent",
          )}
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute -top-1 bottom-[-4px] w-px bg-text/40"
          style={{ left: `${s.selectThreshold}%` }}
          title={`Selection threshold: ${s.selectThreshold}`}
        />
      </div>
      <div className="relative mt-1.5 h-4 text-[11px] text-muted">
        <span className="absolute left-0">0</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${s.selectThreshold}%` }}>
          select ≥ {s.selectThreshold}
        </span>
        <span className="absolute right-0">100</span>
      </div>
    </div>
  );
}

export function VersionRail({
  versions,
  shownVersion,
  onPick,
}: {
  versions: LoopVersion[];
  shownVersion: number;
  onPick: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto px-1">
      {versions.map((v, i) => (
        <div key={v.version} className="flex items-center gap-2">
          {i > 0 && <span className="text-muted">→</span>}
          <button
            onClick={() => onPick(v.version)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
              v.version === shownVersion
                ? "border-accent bg-accent/10 text-text"
                : "border-border bg-surface text-muted hover:text-text",
            )}
          >
            <span className="font-medium">v{v.version}</span>
            <span className="font-mono">{v.score.score}</span>
            {v.score.score >= v.score.selectThreshold && (
              <CheckCircle2 size={12} className="text-ok" />
            )}
          </button>
        </div>
      ))}
    </div>
  );
}

/** S1 + S3: the three parallel reviewer takes and the meta-review that
 *  synthesizes them — the narrative the structured comments are extracted
 *  from. Backends without these heads simply omit the fields. */
function ReviewPanel({ version }: { version: LoopVersion }) {
  const reviews = version.reviews ?? [];
  if (reviews.length === 0 && !version.metaReview) return null;
  return (
    <div className="rounded-card border border-border bg-surface shadow-card">
      <div className="border-b border-faint px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted">
        Reviews & meta-review · v{version.version}
      </div>
      {reviews.length > 0 && (
        <div className="grid gap-2.5 p-4 sm:grid-cols-3">
          {reviews.map((r) => (
            <div key={r.id} className="rounded-input border border-border bg-surface-2/50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text">{r.reviewer}</span>
                <span className="font-mono text-xs text-muted">{r.rating}/10</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{r.summary}</p>
            </div>
          ))}
        </div>
      )}
      {version.metaReview ? (
        <div className={cn("px-4 pb-4", reviews.length === 0 && "pt-4")}>
          <div className="rounded-input border-l-2 border-accent bg-surface-2/60 px-3.5 py-3">
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted">
              Meta-review — AC synthesis of the review & rebuttal history
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-text">{version.metaReview}</p>
          </div>
        </div>
      ) : (
        version.version < META_REVIEW_MIN_TURNS && (
          <div className={cn("px-4 pb-4", reviews.length === 0 && "pt-4")}>
            <div className="rounded-input border border-dashed border-border px-3.5 py-3 text-xs leading-relaxed text-muted">
              The meta-review synthesizes the accumulated rebuttal history — what each
              revision contested and actually fixed — so it opens at v{META_REVIEW_MIN_TURNS},
              after {META_REVIEW_MIN_TURNS} review turns.{" "}
              {META_REVIEW_MIN_TURNS - version.version} more turn
              {META_REVIEW_MIN_TURNS - version.version === 1 ? "" : "s"} to go.
            </div>
          </div>
        )
      )}
    </div>
  );
}

function Attributions({ version }: { version: LoopVersion }) {
  const rows = [...version.score.attributions].sort((a, b) => b.weight - a.weight);
  const setHighlight = useSetRecoilState(manuscriptHighlightState);
  const { inspectorOpen } = useUiStore();
  const anyEvidence = rows.some((a) => (a.evidence?.length ?? 0) > 0);

  // Never leave a stale highlight behind when this card unmounts (navigation,
  // version switch to a different page, etc.).
  useEffect(() => () => setHighlight(null), [setHighlight]);

  return (
    <div className="rounded-card border border-border bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-faint px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted">
        <span>Why this score — feature attribution</span>
        {anyEvidence && inspectorOpen && (
          <span className="text-[10px] normal-case tracking-normal text-muted">
            hover a feature to see evidence
          </span>
        )}
      </div>
      <div className="divide-y divide-faint">
        {rows.map((a) => {
          const hasEvidence = (a.evidence?.length ?? 0) > 0;
          return (
          <div
            key={a.feature}
            className={cn("flex items-center gap-3 px-4 py-2", hasEvidence && "cursor-default")}
            onMouseEnter={
              hasEvidence
                ? () => setHighlight({ feature: a.feature, phrases: a.evidence! })
                : undefined
            }
            onMouseLeave={hasEvidence ? () => setHighlight(null) : undefined}
          >
            <span
              className={cn(
                "w-44 shrink-0 text-[13px] text-text",
                hasEvidence && "underline decoration-border decoration-dotted underline-offset-2",
              )}
            >
              {a.feature}
            </span>
            <div className="relative h-1.5 flex-1 rounded-full bg-surface-2">
              <div
                className={cn(
                  "absolute inset-y-0 rounded-full",
                  a.weight >= 0 ? "left-1/2 bg-ok" : "right-1/2 bg-error",
                )}
                style={{ width: `${Math.min(50, Math.abs(a.weight) * 100)}%` }}
              />
              <div className="absolute inset-y-[-2px] left-1/2 w-px bg-border" />
            </div>
            <span
              className={cn(
                "w-14 shrink-0 text-right font-mono text-xs",
                a.weight >= 0 ? "text-ok" : "text-error",
              )}
            >
              {a.weight >= 0 ? "+" : ""}
              {a.weight.toFixed(2)}
            </span>
          </div>
          );
        })}
      </div>
    </div>
  );
}

const SEVERITY_STYLE: Record<CommentSeverity, string> = {
  major: "bg-error/10 text-error ring-error/30",
  minor: "bg-warn/10 text-warn ring-warn/30",
  question: "bg-surface-2 text-muted ring-border",
};

function CommentCard({
  severity,
  section,
  body,
  resolvedInVersion,
}: {
  severity: CommentSeverity;
  section: string;
  body: string;
  resolvedInVersion?: number;
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-border bg-surface px-4 py-3 shadow-card",
        resolvedInVersion && "opacity-60",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1",
            SEVERITY_STYLE[severity],
          )}
        >
          {severity}
        </span>
        <span className="text-xs text-muted">{section}</span>
        <div className="flex-1" />
        {resolvedInVersion && (
          <span className="flex items-center gap-1 text-[11px] text-ok">
            <CheckCircle2 size={12} />
            resolved in v{resolvedInVersion}
          </span>
        )}
      </div>
      <p
        className={cn(
          "mt-2 text-sm leading-relaxed text-text",
          resolvedInVersion && "line-through decoration-border",
        )}
      >
        {body}
      </p>
    </div>
  );
}
