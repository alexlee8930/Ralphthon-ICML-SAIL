import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ClipboardCheck, Gavel, Loader2, PanelLeft } from "lucide-react";
import { useUiStore } from "@/lib/store";
import { isMacUA } from "@/lib/platform";
import { fileInspectorFromBlock } from "@/lib/artifacts";
import {
  usePaper,
  usePapers,
  useRequestMetaReview,
  useRequestReview,
  useSendMessage,
  useThread,
} from "@/api/queries";
import type { ArtifactBlock } from "@/components/thread/blocks-thread";
import { BlockList, type BlockHandlers } from "@/components/thread/BlockList";
import { Composer } from "@/components/thread/Composer";
import { WorkflowStarters } from "@/components/thread/WorkflowStarters";
import { toThreadBlocks } from "@/components/thread/mapBlocks-thread";
import { useScrollMemory } from "@/components/thread/scrollMemory-thread";
import { InspectorShell } from "@/components/inspector/InspectorShell";
import { MaximizePaneButton, RightPane } from "@/components/inspector/RightPane";
import { cn } from "@/lib/cn";

/**
 * Live Ralph review surface. `/live` (no id) is a blank draft that shows the
 * workflow starters; a paper id in the URL (`/live/:sessionId`) loads that
 * paper's review conversation. The composer sends messages; header actions
 * request an S1 review or synthesize the meta-review, score, and decision.
 *
 * Adapted from Open Science Desktop's OpenCode-runtime `LiveSessionPage`: the
 * runtime store is replaced by the Ralph TanStack Query hooks, and desktop-only
 * runtime chrome (connection badge, Files/Runs toggles, notebook chips) is
 * dropped — the layout structure is preserved verbatim.
 */
export function LiveSessionPage() {
  // The URL id is the paper under review; `/live` with no id is a draft.
  const { sessionId: paperId } = useParams();
  const navigate = useNavigate();

  const papers = usePapers();
  const paperQuery = usePaper(paperId);
  const threadQuery = useThread(paperId);

  // Where a draft's first message lands: the paper in the URL, else the first
  // available paper (mirrors the reference "draft grafts onto a session id").
  const draftPaperId = paperId ?? papers.data?.[0]?.id ?? "";
  const send = useSendMessage(draftPaperId);
  const requestReview = useRequestReview(paperId ?? "");
  const requestMeta = useRequestMetaReview(paperId ?? "");

  const blocks = useMemo(() => toThreadBlocks(threadQuery.data ?? []), [threadQuery.data]);
  const title = paperQuery.data?.title;
  const isEmpty = blocks.length === 0;
  // Opening a paper fetches its history — show skeleton shapes meanwhile.
  const historyLoading = !!paperId && threadQuery.isLoading;
  // A turn is in flight: a message is posting, or a review/meta-review is running.
  const working = send.isPending || requestReview.isPending || requestMeta.isPending;

  // A fresh draft reflects the paper it lands on in the URL after the first turn.
  const afterTurn = () => {
    if (!paperId && draftPaperId) navigate(`/live/${draftPaperId}`);
  };
  const onSend = (text: string) => {
    if (!draftPaperId) return;
    afterTurn();
    send.mutate({ content: text });
  };

  // The right pane belongs to the session: an artifact opened from the thread.
  const [activeArtifact, setActiveArtifact] = useState<ArtifactBlock | null>(null);

  // Interactions from the thread fold back into the conversation as follow-up prompts.
  const handlers: BlockHandlers = {
    onArtifactOpen: (a) => setActiveArtifact(a),
    onFigureComment: (a, figureTitle) =>
      onSend(`On the figure ${figureTitle}, at (${a.x.toFixed(0)}%, ${a.y.toFixed(0)}%): ${a.note}`),
  };
  const onEvaluate = (expr: string) =>
    onSend(`Evaluate in the notebook kernel:\n\`\`\`python\n${expr}\n\`\`\``);

  // Conversation scroll position, per paper — restored once history is in.
  const chatRef = useRef<HTMLDivElement>(null);
  const onChatScroll = useScrollMemory(chatRef, `chat:${paperId ?? "draft"}`, !historyLoading);

  // New blocks (a sent message, an agent reply) pull the conversation to the
  // bottom; the initial history load leaves the remembered position alone.
  const prevBlockCount = useRef(0);
  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    if (prevBlockCount.current > 0 && blocks.length > prevBlockCount.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
    prevBlockCount.current = blocks.length;
  }, [blocks.length]);

  // With the sidebar collapsed this header doubles as the titlebar: it hosts
  // the sidebar expand button — one row, never two.
  const { sidebarCollapsed, setSidebarCollapsed } = useUiStore();
  const isMac = isMacUA();

  const threadError =
    threadQuery.error instanceof Error ? threadQuery.error.message : undefined;

  return (
    <div className="flex h-full min-w-0">
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <div
          className={cn(
            "flex h-12 shrink-0 items-center gap-2 px-6",
            // A draft is a clean page — no separator; an open paper gets a
            // faint one so the title row reads as part of the conversation.
            paperId && "border-b border-faint",
          )}
        >
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
          {/* Left: the paper title is the identity anchor. A draft shows no
              title. min-w-0 lets it truncate instead of shoving the right-side
              controls off the bar. */}
          {paperId && (
            <h1 className="min-w-0 truncate text-[13px] font-medium text-text">{title ?? ""}</h1>
          )}
          <div className="flex-1" />
          {/* Right: quiet ghost controls — no border or fill until hovered, so
              the row stays flat and editorial. These drive the Ralph pipeline:
              request an S1 review, or synthesize the meta-review + decision. */}
          {paperId && (
            <button
              onClick={() => requestReview.mutate()}
              disabled={working}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted transition-colors hover:bg-surface-2 disabled:opacity-50"
              title="Generate an initial review for the current version"
            >
              <ClipboardCheck size={13} />
              <span>Request review</span>
            </button>
          )}
          {paperId && (
            <button
              onClick={() => requestMeta.mutate()}
              disabled={working}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted transition-colors hover:bg-surface-2 disabled:opacity-50"
              title="Synthesize the meta-review, score, and decision"
            >
              <Gavel size={13} />
              <span>Meta-review</span>
            </button>
          )}
        </div>

        <div ref={chatRef} onScroll={onChatScroll} className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-[760px] flex-col gap-4 px-8 py-6">
            {threadError && (
              <div className="rounded-input border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
                {threadError}
              </div>
            )}
            {isEmpty && !paperId && <WorkflowStarters onPick={(p) => onSend(p)} />}
            {historyLoading && <ThreadSkeleton />}
            {!historyLoading && <BlockList blocks={blocks} handlers={handlers} />}
            {working && (
              // Typing-indicator at the bottom of the conversation: the message
              // just echoed above it, so the user always sees the send is alive.
              <div className="flex min-w-0 items-center gap-2 text-sm text-muted">
                <Loader2 size={14} className="shrink-0 animate-spin" />
                <span className="shrink-0">Working…</span>
              </div>
            )}
          </div>
        </div>

        <div className="px-8 pb-5 pt-2">
          <div className="mx-auto max-w-[760px] space-y-3">
            <Composer
              onSend={onSend}
              disabled={!draftPaperId || working}
              placeholder={working ? "Waiting for the reply…" : "Ask anything"}
            />
          </div>
        </div>
      </div>

      {activeArtifact && (
        <RightPane onClose={() => setActiveArtifact(null)}>
          <InspectorShell
            inspector={fileInspectorFromBlock(activeArtifact)}
            onClose={() => setActiveArtifact(null)}
            onEvaluate={onEvaluate}
            controls={<MaximizePaneButton />}
          />
        </RightPane>
      )}
    </div>
  );
}

/** Loading placeholder mirroring the thread's real shapes: a user card, agent
 *  text lines, a quiet row — so the page never sits blank while history loads
 *  and nothing jumps when the content arrives. */
function ThreadSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      <div className="h-11 rounded-card bg-surface-2" />
      <div className="space-y-2.5 px-1 pt-1">
        <div className="h-3.5 w-11/12 rounded bg-surface-2" />
        <div className="h-3.5 w-4/5 rounded bg-surface-2" />
        <div className="h-3.5 w-2/3 rounded bg-surface-2" />
      </div>
      <div className="ml-2 h-4 w-2/5 rounded bg-surface-2 opacity-60" />
      <div className="h-11 rounded-card bg-surface-2" />
      <div className="space-y-2.5 px-1 pt-1">
        <div className="h-3.5 w-5/6 rounded bg-surface-2" />
        <div className="h-3.5 w-3/5 rounded bg-surface-2" />
      </div>
    </div>
  );
}
