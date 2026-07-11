import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSetRecoilState } from "recoil";
import {
  ArrowUp,
  Award,
  Check,
  CheckCircle2,
  CircleDot,
  CornerDownRight,
  FileText,
  FileUp,
  Loader2,
  PanelLeft,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { isMacUA } from "@/lib/platform";
import { manuscriptHighlightState, useUiStore } from "@/lib/store";
import { useQueryClient } from "@tanstack/react-query";
import {
  loopKeys,
  useAgentJob,
  useDeleteLoopPaper,
  useDiscardDraft,
  useLoopPaper,
  useLoopPapers,
  useRevisionApply,
} from "@/api/reviewLoopQueries";
import { loopApi } from "@/api/reviewLoop";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ManuscriptPane } from "@/components/review/ManuscriptPane";
import { ReviewTabs } from "@/components/analysis/ReviewTabs";
import type {
  AgentJob,
  AgentOp,
  CommentSeverity,
  CycleMessage,
  LoopCycle,
  LoopPaper,
  RevisionHunk,
} from "@/api/reviewLoop";

const JOB_LABELS: Record<AgentOp, string> = {
  submit: "Three reviewers are reading your paper",
  reply: "The reviewers are reading your rebuttal",
  "revision-draft": "The revision agent is working on the manuscript",
  finalize: "The Area Chair is writing the meta-review",
  resubmit: "Fresh reviewers are reading the resubmission",
};

/** Live view of a running agent job — harness steps + streamed thinking,
 *  claude-science style, instead of a long opaque wait. */
function AgentWorkingCard({ job, op }: { job?: AgentJob; op: AgentOp }) {
  const events = job?.events ?? [];
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: "smooth" });
  }, [events.length]);
  return (
    <div className="rounded-2xl border border-accent/30 bg-surface shadow-card">
      <div className="flex items-center gap-2 border-b border-faint px-4 py-2.5 text-xs font-medium text-text">
        <Loader2 size={13} className="animate-spin text-accent" />
        <span>{JOB_LABELS[op]}…</span>
        <span className="ml-auto text-[10px] font-normal uppercase tracking-wide text-muted">
          live
        </span>
      </div>
      <div ref={boxRef} className="max-h-56 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-1.5">
          {events.length === 0 && <span className="text-xs text-muted">starting…</span>}
          {events.map((e, i) =>
            e.kind === "step" ? (
              <div key={i} className="flex items-start gap-1.5 text-xs text-text">
                <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-accent" />
                <span>{e.text}</span>
              </div>
            ) : (
              <div key={i} className="pl-2.5 text-xs italic leading-relaxed text-muted">
                {e.text}
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The review loop as the real venue runs it. `/review` submits; `/review/:id`
 * is a chat-style discussion (claude-science-like): reviews arrive as
 * messages, the author rebuts (incl. replying to a specific comment), the AI
 * drafts revision hunks the author allows/denies (the decision log becomes
 * rebuttal text), and the cycle ends with the AC meta-review — the score only
 * exists once that meta-review is written. Resubmitting starts the next cycle
 * fresh, like submitting to ICML again.
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
  const qc = useQueryClient();
  const papers = useLoopPapers();
  const deletePaper = useDeleteLoopPaper();
  const [pendingDelete, setPendingDelete] = useState<LoopPaper | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const job = useAgentJob(jobId);

  useEffect(() => {
    const j = job.data;
    if (!j || !jobId) return;
    if (j.status === "done" && j.paperId) {
      void qc.invalidateQueries({ queryKey: loopKeys.all });
      setJobId(null);
      navigate(`/review/${j.paperId}`);
    } else if (j.status === "error") {
      setJobError(j.error ?? "submission failed");
      setJobId(null);
    }
  }, [job.data, jobId, navigate, qc]);

  const isPending = !!jobId;
  const hasManuscript = text.trim().length > 0 || !!file;
  const canSubmit = title.trim().length > 0 && hasManuscript && !isPending;
  const disabledReason = !title.trim()
    ? "Add a title first"
    : !hasManuscript
      ? "Paste the manuscript text or attach a PDF"
      : null;
  const onSubmit = () => {
    if (!canSubmit) return;
    setJobError(null);
    void loopApi
      .startSubmit({ title: title.trim(), text: text.trim() || undefined, file: file ?? undefined })
      .then(({ jobId }) => setJobId(jobId))
      .catch((e) => setJobError(String(e)));
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
            Submit and three reviewers respond. Rebut them in the thread, apply AI revisions
            hunk by hunk, then request the meta-review — the score only exists once the Area
            Chair writes it. Rejected? Resubmit the revised draft as a fresh cycle.
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
              placeholder="Paste the full paper text — abstract, sections, everything. (Or attach the PDF below.)"
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
                title={disabledReason ?? "Submit for review"}
                className="flex items-center gap-1.5 rounded-input bg-accent px-4 py-2 text-[13px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {isPending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Reviewers reading…</span>
                  </>
                ) : (
                  <>
                    <ArrowUp size={14} />
                    <span>Submit for review</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {isPending && (
            <div className="mt-4">
              <AgentWorkingCard job={job.data} op="submit" />
            </div>
          )}
          {jobError && (
            <div className="mt-4 rounded-card border border-error/30 bg-error/5 px-4 py-2.5 text-xs text-error">
              {jobError}
            </div>
          )}

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
          body={`"${pendingDelete.title}" and all its cycles will be permanently removed.`}
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

/** The score shown for a paper in lists: the latest decided cycle's, if any. */
export function latestDecidedScore(paper: LoopPaper): number | undefined {
  for (let i = paper.cycles.length - 1; i >= 0; i--) {
    const s = paper.cycles[i].score;
    if (s) return s.score;
  }
  return undefined;
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
  const score = latestDecidedScore(paper);
  const accepted = paper.cycles.some((c) => c.decision === "accept");
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
      {accepted ? (
        <CheckCircle2 size={16} className="shrink-0 text-ok" />
      ) : (
        <CircleDot size={16} className="shrink-0 text-warn" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-text">{paper.title}</div>
        <div className="text-xs text-muted">
          cycle {paper.currentCycle} ·{" "}
          {paper.status === "decided"
            ? paper.cycles[paper.cycles.length - 1].decision === "accept"
              ? "Accepted"
              : "Rejected — resubmit"
            : "In discussion"}
        </div>
      </div>
      <div className="font-mono text-sm text-text">
        {score ?? "—"}
        <span className="text-muted">{score !== undefined ? "/100" : ""}</span>
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
/* Loop surface — chat-style discussion                                */
/* ------------------------------------------------------------------ */

function LoopView({ paperId }: { paperId: string }) {
  const paper = useLoopPaper(paperId);
  const qc = useQueryClient();
  const revisionApply = useRevisionApply(paperId);
  const discardDraft = useDiscardDraft(paperId);

  // Long agent ops run as jobs; the card below streams their progress.
  const [activeJob, setActiveJob] = useState<{ op: AgentOp; id: string } | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const job = useAgentJob(activeJob?.id ?? null);
  useEffect(() => {
    const j = job.data;
    if (!j || !activeJob) return;
    if (j.status === "done") {
      void qc.invalidateQueries({ queryKey: loopKeys.one(paperId) });
      void qc.invalidateQueries({ queryKey: loopKeys.all });
      setActiveJob(null);
    } else if (j.status === "error") {
      setJobError(j.error ?? "agent job failed");
      setActiveJob(null);
    }
  }, [job.data, activeJob, paperId, qc]);

  const startOp = (op: Exclude<AgentOp, "submit">, payload?: { text?: string; replyTo?: string }) => {
    setJobError(null);
    void loopApi
      .startOp(paperId, op, payload)
      .then(({ jobId }) => setActiveJob({ op, id: jobId }))
      .catch((e) => setJobError(String(e)));
  };

  const [viewCycle, setViewCycle] = useState<number | null>(null);
  const { sidebarCollapsed, setSidebarCollapsed, inspectorOpen, setInspectorOpen } = useUiStore();
  const isMac = isMacUA();

  const p = paper.data;
  const shown: LoopCycle | undefined = useMemo(() => {
    if (!p) return undefined;
    const n = viewCycle ?? p.currentCycle;
    return p.cycles.find((c) => c.cycle === n);
  }, [p, viewCycle]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const threadLen = shown?.thread.length ?? 0;
  const jobEventCount = job.data?.events.length ?? 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [threadLen, shown?.pendingRevision?.hunks.length, shown?.score?.score, jobEventCount]);

  if (paper.isLoading || !p || !shown) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        {paper.error ? String(paper.error) : "Loading…"}
      </div>
    );
  }

  const isCurrent = shown.cycle === p.currentCycle;
  const inDiscussion = p.status === "in_discussion" && isCurrent;
  const decided = !!shown.score;
  const busy = !!activeJob || revisionApply.isPending;

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* ---- header ---- */}
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
          <StatusChip cycle={shown} inDiscussion={inDiscussion} />
          <CycleRail
            cycles={p.cycles}
            shownCycle={shown.cycle}
            onPick={(n) => setViewCycle(n === p.currentCycle ? null : n)}
          />
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
        </div>

        {/* ---- discussion ---- */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-[760px] flex-col gap-4 px-6 py-5">
            <ReviewsBlock cycle={shown} />
            <CommentsBlock
              cycle={shown}
              canReply={inDiscussion}
              onReply={(c) => setReplyTarget({ id: c.id, label: `${c.reviewer} · ${c.section}` })}
            />
            {shown.thread.map((m) => (
              <ThreadMessage key={m.id} msg={m} cycle={shown} />
            ))}
            {shown.pendingRevision && !decided && (
              <RevisionCard
                cycle={shown}
                readOnly={!inDiscussion || !!shown.draftManuscript}
                pending={revisionApply.isPending}
                onApply={(decisions) =>
                  revisionApply.mutate(decisions, {
                    onSuccess: (paper) => {
                      // The allow/deny log becomes draft rebuttal text —
                      // editable in the composer, sent when the author is ready.
                      const note = paper.cycles[paper.cycles.length - 1]?.revisionNote;
                      if (note) composerTextBridge?.(note);
                    },
                  })
                }
              />
            )}
            {activeJob && isCurrent && <AgentWorkingCard job={job.data} op={activeJob.op} />}
            {jobError && (
              <div className="rounded-card border border-error/30 bg-error/5 px-4 py-2.5 text-xs text-error">
                {jobError}
              </div>
            )}
            {decided && shown.score && (
              <>
                <ScoreHero cycle={shown} />
                <Attributions cycle={shown} />
                {isCurrent && (
                  <div className="flex items-center justify-between rounded-card border border-border bg-surface-2 px-4 py-3">
                    <div className="text-xs text-muted">
                      {shown.decision === "accept"
                        ? "Accepted — you can still resubmit the revised draft as a fresh cycle to push for the best-paper band."
                        : "Rejected this cycle. Resubmit the revised draft — new reviewers, fresh context, like submitting again."}
                    </div>
                    <button
                      onClick={() => startOp("resubmit")}
                      disabled={busy}
                      className="ml-4 flex shrink-0 items-center gap-1.5 rounded-input bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {activeJob?.op === "resubmit" ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <RefreshCw size={13} />
                      )}
                      <span>Resubmit as cycle {p.currentCycle + 1}</span>
                    </button>
                  </div>
                )}
              </>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* ---- composer ---- */}
        {inDiscussion && (
          <Composer
            busy={busy}
            replyPending={activeJob?.op === "reply"}
            draftPending={activeJob?.op === "revision-draft"}
            finalizePending={activeJob?.op === "finalize"}
            hasRevisedDraft={!!shown.draftManuscript}
            onDiscardDraft={() => discardDraft.mutate()}
            onSend={(text, replyTo) => startOp("reply", { text, replyTo })}
            onDraft={() => startOp("revision-draft")}
            onFinalize={() => startOp("finalize")}
          />
        )}
      </div>

      {inspectorOpen && <ManuscriptPane cycle={shown} paperId={paperId} editable={inDiscussion} />}
    </div>
  );

  // setReplyTarget is defined on Composer via a module-scoped bridge below.
  function setReplyTarget(t: { id: string; label: string }) {
    composerBridge?.(t);
  }
}

/** Comment "Reply" buttons live outside the composer; a tiny bridge hands the
 *  target down without lifting composer state through the whole page. */
let composerBridge: ((t: { id: string; label: string }) => void) | null = null;
/** Pre-fill the composer (e.g. the hunk allow/deny log as draft rebuttal). */
let composerTextBridge: ((text: string) => void) | null = null;

function Composer({
  busy,
  replyPending,
  draftPending,
  finalizePending,
  hasRevisedDraft,
  onDiscardDraft,
  onSend,
  onDraft,
  onFinalize,
}: {
  busy: boolean;
  replyPending: boolean;
  draftPending: boolean;
  finalizePending: boolean;
  hasRevisedDraft: boolean;
  onDiscardDraft: () => void;
  onSend: (text: string, replyTo?: string) => void;
  onDraft: () => void;
  onFinalize: () => void;
}) {
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; label: string } | null>(null);

  useEffect(() => {
    composerBridge = setReplyTo;
    composerTextBridge = setText;
    return () => {
      composerBridge = null;
      composerTextBridge = null;
    };
  }, []);

  const send = () => {
    const t = text.trim();
    if (!t || busy) return;
    onSend(t, replyTo?.id);
    setText("");
    setReplyTo(null);
  };

  return (
    <div className="shrink-0 px-6 pb-4 pt-1">
      <div className="mx-auto max-w-[760px]">
        {/* Floating composer card — rounded, elevated above the page bg. */}
        <div
          className={cn(
            "rounded-2xl border border-border bg-surface shadow-card transition-shadow",
            "focus-within:border-accent/50 focus-within:shadow-lg",
          )}
        >
          {replyTo && (
            <div className="flex items-center gap-1.5 px-4 pt-3 text-[11px] text-muted">
              <CornerDownRight size={12} />
              <span>
                Replying to <span className="text-text">{replyTo.label}</span>
              </span>
              <button
                onClick={() => setReplyTo(null)}
                aria-label="Cancel reply"
                className="rounded p-0.5 hover:bg-surface-2 hover:text-text"
              >
                <X size={11} />
              </button>
            </div>
          )}
          {hasRevisedDraft && (
            <div className="flex items-center gap-1.5 px-4 pt-3 text-[11px] text-muted">
              <CornerDownRight size={12} />
              <span>
                <span className="text-text">Revised draft</span> attached to your next message
              </span>
              <button
                onClick={onDiscardDraft}
                aria-label="Discard the revised draft"
                title="Discard the revised draft"
                className="rounded p-0.5 hover:bg-surface-2 hover:text-text"
              >
                <X size={11} />
              </button>
            </div>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
            }}
            placeholder={
              replyTo
                ? "Write your rebuttal to this comment…"
                : "Message the reviewers — rebut, clarify, or argue your case…"
            }
            rows={2}
            className="block w-full resize-none bg-transparent px-4 pb-1 pt-3 text-sm text-text outline-none placeholder:text-muted"
          />
          <div className="flex items-center gap-1.5 px-3 pb-2.5">
            <button
              onClick={onDraft}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-50"
              title="Ralph drafts revision hunks addressing the open comments — you allow or deny each"
            >
              {draftPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Sparkles size={13} />
              )}
              <span>Draft revision</span>
            </button>
            <button
              onClick={onFinalize}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-50"
              title="End the discussion — the Area Chair writes the meta-review and only then a score appears"
            >
              {finalizePending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Award size={13} />
              )}
              <span>Request meta-review</span>
            </button>
            <div className="flex-1" />
            <span className="hidden text-[10px] text-muted sm:block">
              score appears only with the meta-review
            </span>
            <button
              onClick={send}
              disabled={!text.trim() || busy}
              title="Send (⌘↵)"
              aria-label="Send"
              className="flex h-8 w-9 items-center justify-center rounded-xl bg-accent text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {replyPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ArrowUp size={15} strokeWidth={2.2} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Blocks                                                              */
/* ------------------------------------------------------------------ */

function StatusChip({ cycle, inDiscussion }: { cycle: LoopCycle; inDiscussion: boolean }) {
  if (cycle.decision === "accept") {
    return (
      <span className="shrink-0 rounded-full bg-ok/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ok ring-1 ring-ok/30">
        Accepted
      </span>
    );
  }
  if (cycle.decision === "reject") {
    return (
      <span className="shrink-0 rounded-full bg-error/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-error ring-1 ring-error/30">
        Rejected
      </span>
    );
  }
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1",
        inDiscussion ? "bg-warn/10 text-warn ring-warn/30" : "bg-surface-2 text-muted ring-border",
      )}
    >
      In discussion
    </span>
  );
}

export function CycleRail({
  cycles,
  shownCycle,
  onPick,
}: {
  cycles: LoopCycle[];
  shownCycle: number;
  onPick: (n: number) => void;
}) {
  if (cycles.length < 2) return null;
  return (
    <div className="flex shrink-0 items-center gap-1">
      {cycles.map((c) => (
        <button
          key={c.cycle}
          onClick={() => onPick(c.cycle)}
          className={cn(
            "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors",
            c.cycle === shownCycle
              ? "border-accent bg-accent/10 text-text"
              : "border-border bg-surface text-muted hover:text-text",
          )}
          title={`Cycle ${c.cycle}${c.score ? ` — ${c.score.score}/100` : " — in discussion"}`}
        >
          <span>C{c.cycle}</span>
          {c.score && <span className="font-mono">{c.score.score}</span>}
          {c.decision === "accept" && <CheckCircle2 size={11} className="text-ok" />}
        </button>
      ))}
    </div>
  );
}

const SEVERITY_STYLE: Record<CommentSeverity, string> = {
  major: "bg-error/10 text-error ring-error/30",
  minor: "bg-warn/10 text-warn ring-warn/30",
  question: "bg-surface-2 text-muted ring-border",
};

function ReviewsBlock({ cycle }: { cycle: LoopCycle }) {
  return (
    <div>
      <div className="px-1 text-xs font-medium uppercase tracking-wider text-muted">
        Reviews — cycle {cycle.cycle}
      </div>
      <div className="mt-2 grid gap-2.5 sm:grid-cols-3">
        {cycle.reviews.map((r) => (
          <ReviewCard key={r.id} review={r} />
        ))}
      </div>
    </div>
  );
}

function ReviewCard({ review }: { review: LoopCycle["reviews"][number] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={cn(
        "rounded-card border border-border bg-surface p-3 shadow-card",
        expanded && "sm:col-span-3",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text">{review.reviewer}</span>
        <span className="font-mono text-xs text-muted">{review.rating}/10</span>
      </div>
      {expanded && review.body ? (
        <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-text">
          {review.body}
        </p>
      ) : (
        <p className="mt-1.5 text-xs leading-relaxed text-muted">{review.summary}</p>
      )}
      {review.body && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-[11px] text-accent hover:underline"
        >
          {expanded ? "Show summary" : "Read full review"}
        </button>
      )}
    </div>
  );
}

function CommentsBlock({
  cycle,
  canReply,
  onReply,
}: {
  cycle: LoopCycle;
  canReply: boolean;
  onReply: (c: LoopCycle["comments"][number]) => void;
}) {
  if (cycle.comments.length === 0) return null;
  return (
    <div>
      <div className="px-1 text-xs font-medium uppercase tracking-wider text-muted">
        Review comments
      </div>
      <div className="mt-2 flex flex-col gap-2">
        {cycle.comments.map((c) => (
          <div key={c.id} className="flex justify-start">
            <div className="group max-w-[85%] rounded-card border border-border bg-surface px-4 py-2.5 shadow-card">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1",
                    SEVERITY_STYLE[c.severity],
                  )}
                >
                  {c.severity}
                </span>
                <span className="text-xs text-muted">
                  {c.reviewer} · {c.section}
                </span>
                {canReply && (
                  <button
                    onClick={() => onReply(c)}
                    className="invisible flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted hover:bg-surface-2 hover:text-text group-hover:visible"
                  >
                    <CornerDownRight size={11} />
                    Reply
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-text">{c.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThreadMessage({ msg, cycle }: { msg: CycleMessage; cycle: LoopCycle }) {
  const isAuthor = msg.role === "author";
  const isAC = msg.role === "ac";
  const refComment = msg.replyTo ? cycle.comments.find((c) => c.id === msg.replyTo) : undefined;

  if (isAC) {
    return (
      <div className="rounded-card border-l-2 border-accent bg-surface-2/60 px-4 py-3">
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
          <Award size={11} />
          Area Chair — meta-review
        </div>
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-text">{msg.body}</p>
      </div>
    );
  }

  return (
    <div className={cn("flex", isAuthor ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-card border px-3.5 py-2.5 shadow-card",
          isAuthor ? "border-accent/30 bg-accent/10" : "border-border bg-surface",
        )}
      >
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <span className={cn("font-medium", isAuthor ? "text-accent" : "text-text")}>
            {isAuthor ? "You (Author)" : msg.author}
          </span>
        </div>
        {refComment && (
          <div className="mt-1 rounded border-l-2 border-border bg-surface-2/60 px-2 py-1 text-[11px] text-muted">
            ↪ {refComment.reviewer} · {refComment.section}: {refComment.body.slice(0, 110)}
            {refComment.body.length > 110 ? "…" : ""}
          </div>
        )}
        {msg.attachment === "revised-draft" && (
          <div className="mt-1 flex items-center gap-1 rounded border-l-2 border-ok/50 bg-ok/5 px-2 py-1 text-[11px] text-muted">
            <FileText size={11} />
            <span>Revised manuscript attached</span>
          </div>
        )}
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-text">{msg.body}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Revision hunks — allow/deny with live highlight in the pane         */
/* ------------------------------------------------------------------ */

function RevisionCard({
  cycle,
  readOnly,
  pending,
  onApply,
}: {
  cycle: LoopCycle;
  readOnly: boolean;
  pending: boolean;
  onApply: (decisions: Record<string, boolean>) => void;
}) {
  const hunks = cycle.pendingRevision!.hunks;
  const setHighlight = useSetRecoilState(manuscriptHighlightState);
  const [decisions, setDecisions] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(hunks.map((h) => [h.id, h.decision ? h.decision === "allowed" : true])),
  );
  useEffect(() => () => setHighlight(null), [setHighlight]);

  const commentFor = (h: RevisionHunk) =>
    h.commentIds
      .map((id) => cycle.comments.find((c) => c.id === id))
      .filter(Boolean)
      .map((c) => `${c!.reviewer} · ${c!.section}`)
      .join(", ");

  if (hunks.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-border px-4 py-3 text-xs text-muted">
        Ralph found nothing it could honestly revise — the manuscript needs substantive content
        first (no results are ever fabricated).
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border bg-surface shadow-card">
      <div className="flex items-center gap-1.5 border-b border-faint px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted">
        <Sparkles size={12} />
        AI revision draft — allow or deny each change
        <span className="ml-auto text-[10px] normal-case tracking-normal">
          hover a hunk to see it in the manuscript
        </span>
      </div>
      <div className="divide-y divide-faint">
        {hunks.map((h) => {
          const allowed = decisions[h.id];
          return (
            <div
              key={h.id}
              className="px-4 py-3"
              onMouseEnter={() => setHighlight({ feature: "revision", phrases: [h.before, h.after] })}
              onMouseLeave={() => setHighlight(null)}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="rounded bg-error/5 px-2 py-1 text-xs leading-relaxed text-muted line-through decoration-error/40">
                    {h.before}
                  </div>
                  <div className="mt-1 rounded bg-ok/10 px-2 py-1 text-xs leading-relaxed text-text">
                    {h.after}
                  </div>
                  <div className="mt-1.5 text-[11px] text-muted">
                    {h.rationale}
                    {commentFor(h) && <span> — addresses {commentFor(h)}</span>}
                  </div>
                </div>
                {readOnly ? (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ring-1",
                      h.decision === "allowed"
                        ? "bg-ok/10 text-ok ring-ok/30"
                        : "bg-surface-2 text-muted ring-border",
                    )}
                  >
                    {h.decision ?? "pending"}
                  </span>
                ) : (
                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      onClick={() => setDecisions((d) => ({ ...d, [h.id]: true }))}
                      className={cn(
                        "flex items-center gap-1 rounded-input border px-2 py-0.5 text-[11px]",
                        allowed
                          ? "border-ok/40 bg-ok/10 text-ok"
                          : "border-border text-muted hover:text-text",
                      )}
                    >
                      <Check size={11} /> Allow
                    </button>
                    <button
                      onClick={() => setDecisions((d) => ({ ...d, [h.id]: false }))}
                      className={cn(
                        "flex items-center gap-1 rounded-input border px-2 py-0.5 text-[11px]",
                        !allowed
                          ? "border-error/40 bg-error/10 text-error"
                          : "border-border text-muted hover:text-text",
                      )}
                    >
                      <X size={11} /> Deny
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!readOnly && (
        <div className="flex items-center justify-between border-t border-faint px-4 py-2.5">
          <span className="text-[11px] text-muted">
            Your decisions are logged into the thread as rebuttal text.
          </span>
          <button
            onClick={() => onApply(decisions)}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-input bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            <span>Apply decisions</span>
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Decision blocks                                                     */
/* ------------------------------------------------------------------ */

function ScoreHero({ cycle }: { cycle: LoopCycle }) {
  const s = cycle.score!;
  const pct = Math.min(100, Math.max(0, s.score));
  return (
    <div className="rounded-card border border-border bg-surface p-5 shadow-card">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted">
            Selection score · cycle {cycle.cycle}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-serif text-[44px] font-semibold leading-none tracking-tight text-text">
              {s.score}
            </span>
            <span className="text-lg text-muted">/ 100</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted">Predicted tier</div>
          <div className="mt-0.5 text-sm font-medium text-text">{s.gradeTier}</div>
        </div>
      </div>
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

function Attributions({ cycle }: { cycle: LoopCycle }) {
  const rows = [...cycle.score!.attributions].sort((a, b) => b.weight - a.weight);
  const setHighlight = useSetRecoilState(manuscriptHighlightState);
  const { inspectorOpen } = useUiStore();
  const anyEvidence = rows.some((a) => (a.evidence?.length ?? 0) > 0);
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
