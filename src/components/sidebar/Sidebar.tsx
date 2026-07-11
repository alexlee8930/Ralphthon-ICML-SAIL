import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Files, FlaskConical, FolderTree, NotebookPen, PanelLeft, Plus, Settings, Trash2, Award } from "lucide-react";
import { cn } from "@/lib/cn";
import { isMacUA } from "@/lib/platform";
import { SIDEBAR_MAX, SIDEBAR_MIN, useOverlayTitlebar, useUiStore } from "@/lib/store";
import type { Project } from "@/lib/mock";
import { StatusPills } from "./StatusPills";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/** The product logo, embedded so the shell is self-contained (no asset fetch). */
const logo = "data:image/webp;base64,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";

interface Row {
  id: string;
  title: string;
  to: string;
  kind: "session" | "example";
}

/** Dragging the divider below this pointer x collapses the sidebar; dragging
 *  back past it re-expands. Sits below SIDEBAR_MIN so there is a clear "snap". */
const COLLAPSE_BELOW = 140;

export function Sidebar({ project }: { project: Project }) {
  const navigate = useNavigate();
  const location = useLocation();
  // Examples the user has hidden this session (no runtime store on the web).
  const [hiddenExamples, setHiddenExamples] = useState<string[]>([]);
  const { sidebarCollapsed, sidebarWidth, setSidebarCollapsed, setSidebarWidth, toggleSidebar } =
    useUiStore();
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
    navigate("/live");
  };

  const rows: Row[] = project.sessions
    .filter((e) => !hiddenExamples.includes(e.id))
    .map((e) => ({ id: e.id, title: e.title, to: `/example/${e.id}`, kind: "example" as const }));

  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);

  const confirmDelete = () => {
    const row = pendingDelete;
    setPendingDelete(null);
    if (!row) return;
    setHiddenExamples((h) => [...h, row.id]);
    if (location.pathname === row.to) navigate("/live");
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
          <img src={logo} alt="" className="h-[18px] w-auto self-center" />
          <div className="font-serif text-[17px] font-semibold leading-none tracking-tight text-text">
            Ralph
          </div>
          <span className="text-[10px] uppercase tracking-widest text-muted">Beta</span>
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
        <NavRow icon={<Plus size={16} />} label="New" onClick={startNew} />
        <NavRow icon={<Award size={16} />} label="Review" onClick={() => navigate("/review")} />
        <NavRow icon={<NotebookPen size={16} />} label="Notebooks" onClick={() => navigate("/notebooks")} />
        <NavRow icon={<FolderTree size={16} />} label="Files" onClick={() => navigate("/files")} />
        <NavRow icon={<FlaskConical size={16} />} label="Runs" onClick={() => navigate("/runs")} />
        <NavRow icon={<Files size={16} />} label="Skills" onClick={() => navigate("/skills")} />
      </nav>

      <div className="mt-4 flex-1 overflow-y-auto px-3 pb-2">
        <div className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-muted">History</div>
        {rows.length === 0 && (
          <div className="px-2 py-2 text-xs text-muted">No conversations yet.</div>
        )}
        {rows.map((row) => (
          <div key={row.to} className="group relative">
            <NavLink
              to={row.to}
              className={cn(
                "flex items-center gap-2 rounded-input py-1 pl-2 pr-8 text-[13px] hover:bg-surface-2",
                location.pathname === row.to ? "bg-surface-2 text-text" : "text-text/90",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  row.kind === "example" ? "bg-muted" : "bg-ok",
                )}
              />
              <span className="flex-1 truncate">{row.title}</span>
              {row.kind === "example" && (
                <span className="shrink-0 rounded-full bg-surface-2 px-1.5 text-[10px] uppercase tracking-wide text-muted ring-1 ring-border">
                  example
                </span>
              )}
            </NavLink>
            <button
              onClick={() => setPendingDelete(row)}
              aria-label={`Delete ${row.title}`}
              className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded p-1 text-muted hover:bg-border hover:text-error group-hover:block"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
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

      {pendingDelete && (
        <ConfirmDialog
          title={pendingDelete.kind === "session" ? "Delete session?" : "Hide example?"}
          body={
            pendingDelete.kind === "session"
              ? `"${pendingDelete.title}" and its messages will be deleted. This cannot be undone.`
              : `"${pendingDelete.title}" will be hidden from the sidebar.`
          }
          confirmLabel={pendingDelete.kind === "session" ? "Delete" : "Hide"}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      </aside>

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
