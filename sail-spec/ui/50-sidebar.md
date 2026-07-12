# 50 · 사이드바

의존: 31-queries, 40-lib, 55-primitives(ConfirmDialog), design/10

산출 파일:

- `src/components/sidebar/Sidebar.tsx`
- `src/components/sidebar/StatusPills.tsx`

---

좌측 내비게이션. 세션(논문) 목록·최근 점수 배지·삭제(ConfirmDialog)·
새 리뷰 시작·Settings 링크·⌘B 접기·두 줄 브랜드 록업
("ICML SAIL" / "with Ralph")·StatusPills(백엔드 Mock/API 상태).


---

### 파일: `src/components/sidebar/Sidebar.tsx` (233줄) — **verbatim, 글자 그대로 사용**

````tsx
import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Award, PanelLeft, Plus, Settings, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { isMacUA } from "@/lib/platform";
import { SIDEBAR_MAX, SIDEBAR_MIN, useOverlayTitlebar, useUiStore } from "@/lib/store";
import { useDeleteLoopPaper, useLoopPapers } from "@/api/reviewLoopQueries";
import type { LoopPaper } from "@/api/reviewLoop";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StatusPills } from "./StatusPills";


/** Dragging the divider below this pointer x collapses the sidebar; dragging
 *  back past it re-expands. Sits below SIDEBAR_MIN so there is a clear "snap". */
const COLLAPSE_BELOW = 140;

/** The score shown next to a paper: the latest decided cycle's, if any. */
function latestScore(paper: LoopPaper): number | undefined {
  for (let i = paper.cycles.length - 1; i >= 0; i--) {
    const s = paper.cycles[i].score;
    if (s) return s.score;
  }
  return undefined;
}

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sidebarCollapsed, sidebarWidth, setSidebarCollapsed, setSidebarWidth, toggleSidebar } =
    useUiStore();
  const { data: papers } = useLoopPapers();
  const deletePaper = useDeleteLoopPaper();
  const [pendingDelete, setPendingDelete] = useState<LoopPaper | null>(null);
  // While dragging, the live width lives here; the store (and localStorage)
  // are only written on pointer-up.
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const dragging = dragWidth !== null;

  const onDividerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragWidth(sidebarWidth);
  };

  const onDividerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    // The sidebar starts at the window's left edge, so clientX is the width.
    const x = e.clientX;
    if (x < COLLAPSE_BELOW) {
      if (!sidebarCollapsed) setSidebarCollapsed(true);
      return;
    }
    if (sidebarCollapsed) setSidebarCollapsed(false);
    setDragWidth(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, x)));
  };

  const onDividerPointerUp = () => {
    if (!dragging) return;
    setSidebarWidth(dragWidth);
    setDragWidth(null);
  };

  const startNew = () => {
    navigate("/review");
  };

  const isMac = isMacUA();
  const overlayTitlebar = useOverlayTitlebar();

  const width = dragWidth ?? sidebarWidth;

  return (
    <div
      className={cn(
        "relative h-full shrink-0 overflow-hidden",
        !dragging && "transition-[width] duration-200 ease-out",
      )}
      style={{ width: sidebarCollapsed ? 0 : width }}
    >
      <aside
        className="flex h-full flex-col border-r border-border bg-surface"
        style={{ width }}
      >
      {/* Overlay-titlebar strip (desktop only) — never rendered on the web. */}
      {overlayTitlebar && (
        <div className="flex h-12 shrink-0 items-center pl-[78px]">
          <button
            onClick={toggleSidebar}
            aria-label="Collapse sidebar"
            title="Collapse sidebar (⌘B)"
            className="rounded p-1 text-text hover:bg-surface-2"
          >
            <PanelLeft size={14} strokeWidth={1.5} />
          </button>
        </div>
      )}
      <div className={cn("px-4 pb-3", overlayTitlebar ? "pt-1" : "pt-4")}>
        <div className="flex items-baseline gap-1.5">
          <Award size={18} strokeWidth={2} className="shrink-0 self-center text-accent" aria-hidden />
          <div className="min-w-0">
            <div className="truncate font-serif text-[17px] font-semibold leading-none tracking-tight text-text">
              ICML SAIL
            </div>
            <div className="mt-1 whitespace-nowrap text-[10px] uppercase tracking-widest text-muted">
              with Ralph
            </div>
          </div>
          {!overlayTitlebar && (
            <button
              onClick={toggleSidebar}
              aria-label="Collapse sidebar"
              title={`Collapse sidebar (${isMac ? "⌘B" : "Ctrl+B"})`}
              className="ml-auto self-center rounded p-1 text-text hover:bg-surface-2"
            >
              <PanelLeft size={14} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      <nav className="flex flex-col px-3">
        <NavRow icon={<Plus size={16} />} label="New review" onClick={startNew} />
      </nav>

      <div className="mt-4 flex-1 overflow-y-auto px-3 pb-2">
        <div className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-muted">Reviews</div>
        {papers && papers.length === 0 && (
          <div className="px-2 py-2 text-xs text-muted">No submissions yet.</div>
        )}
        {(papers ?? []).map((paper) => {
          const to = `/review/${paper.id}`;
          return (
            <NavLink
              key={paper.id}
              to={to}
              className={cn(
                "group flex items-center gap-2 rounded-input py-1 pl-2 pr-2 text-[13px] hover:bg-surface-2",
                location.pathname === to ? "bg-surface-2 text-text" : "text-text/90",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  paper.cycles.some((c) => c.decision === "accept") ? "bg-ok" : "bg-warn",
                )}
              />
              <span className="flex-1 truncate">{paper.title}</span>
              <span className="ml-auto shrink-0 font-mono text-[11px] text-muted group-hover:hidden">
                {latestScore(paper) ?? "·"}
              </span>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setPendingDelete(paper);
                }}
                aria-label={`Delete "${paper.title}"`}
                title="Delete this review"
                className="ml-auto hidden shrink-0 rounded p-0.5 text-muted hover:text-error group-hover:block"
              >
                <Trash2 size={13} strokeWidth={1.5} />
              </button>
            </NavLink>
          );
        })}
      </div>

      <div className="border-t border-border px-3 py-3">
        <StatusPills />
        <button
          className="relative mt-2 flex items-center gap-2 rounded-input px-2 py-1 text-[13px] text-muted hover:bg-surface-2 hover:text-text"
          onClick={() => navigate("/settings")}
          aria-label="Settings"
        >
          <Settings size={15} />
          <span>Settings</span>
        </button>
      </div>
      </aside>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this review?"
          body={`"${pendingDelete.title}" and its full version history will be permanently removed.`}
          confirmLabel="Delete"
          onConfirm={() => {
            const id = pendingDelete.id;
            setPendingDelete(null);
            deletePaper.mutate(id, {
              onSuccess: () => {
                if (location.pathname.startsWith(`/review/${id}`)) navigate("/review");
              },
            });
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {/* Drag divider: resize within [SIDEBAR_MIN, SIDEBAR_MAX]; dragging far
          left snaps the sidebar closed. Kept mounted while collapsed so an
          in-flight drag (pointer capture) can re-open it. */}
      <div
        onPointerDown={onDividerPointerDown}
        onPointerMove={onDividerPointerMove}
        onPointerUp={onDividerPointerUp}
        onPointerCancel={onDividerPointerUp}
        className={cn(
          "group absolute inset-y-0 right-0 z-10 w-[5px] cursor-col-resize",
          sidebarCollapsed && !dragging && "pointer-events-none",
        )}
      >
        <div
          className={cn(
            "absolute inset-y-0 right-0 w-[2px] transition-colors",
            dragging ? "bg-accent/60" : "bg-transparent group-hover:bg-accent/40",
          )}
        />
      </div>
    </div>
  );
}

function NavRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-input px-2 py-1 text-[13px] text-text hover:bg-surface-2"
    >
      <span className="text-muted">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
````

### 파일: `src/components/sidebar/StatusPills.tsx` (31줄) — **verbatim, 글자 그대로 사용**

````tsx
import { cn } from "@/lib/cn";
import { loopApi } from "@/api/reviewLoop";

/**
 * Runtime status pills. The desktop app read a live OpenCode runtime; on the
 * web the API layer is always reachable (the mock adapter serves when no
 * backend URL is set), so this renders a static "ready" state and reflects
 * whether the mock or a real backend is answering.
 */
export function StatusPills() {
  const modelValue = loopApi.usingMock ? "mock" : "api";

  return (
    <div className="flex flex-col gap-1 text-xs text-muted">
      <Pill dot="bg-ok" label="Runtime" value="ready" />
      <Pill dot="bg-ok" label="Model" value={modelValue} />
    </div>
  );
}

function Pill({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 px-2">
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
      <span className="shrink-0">{label}</span>
      <span className="ml-auto min-w-0 truncate capitalize text-text/70" title={value}>
        {value}
      </span>
    </div>
  );
}
````
