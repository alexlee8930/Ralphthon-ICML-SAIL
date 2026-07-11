import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { PanelLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { Toaster } from "@/components/ui/Toaster";
import { mockProject } from "@/lib/mock";
import { isMacUA, openExternal } from "@/lib/platform";
import { useOverlayTitlebar, useToggleSidebar, useUiStore } from "@/lib/store";

export function AppShell() {
  const { sidebarCollapsed, setSidebarCollapsed } = useUiStore();
  const toggleSidebar = useToggleSidebar();

  // Cmd/Ctrl+B toggles the sidebar, matching the button's tooltip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  // External links open in a new tab. Navigating the app away in place would
  // strand the user — there is no back button on the shell.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest?.("a[href]");
      const href = anchor?.getAttribute("href") ?? "";
      if (/^https?:\/\//i.test(href)) {
        e.preventDefault();
        openExternal(href);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // The live session page's own header doubles as the titlebar when the
  // sidebar is collapsed; every other route gets this fallback strip so the
  // window stays usable and the sidebar can be re-expanded.
  const isMac = isMacUA();
  const overlayTitlebar = useOverlayTitlebar();
  const pageOwnsTitlebar = useLocation().pathname.startsWith("/live");

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-text">
      <Sidebar project={mockProject} />
      <main className="flex min-w-0 flex-1 flex-col">
        {sidebarCollapsed && !pageOwnsTitlebar && (
          <div
            className={cn(
              "flex h-12 shrink-0 items-center",
              overlayTitlebar ? "pl-[78px]" : "pl-2",
            )}
          >
            <button
              onClick={() => setSidebarCollapsed(false)}
              aria-label="Expand sidebar"
              title={`Expand sidebar (${isMac ? "⌘B" : "Ctrl+B"})`}
              className="fade-in rounded p-1 text-text hover:bg-surface-2"
            >
              <PanelLeft size={14} strokeWidth={1.5} />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1">
          <Outlet />
        </div>
      </main>
      <CommandPalette />
      <Toaster />
    </div>
  );
}
