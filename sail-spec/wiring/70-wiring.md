# 70 · 와이어링 (엔트리·라우터·셸·테마)

의존: 모든 선행 단위

산출 파일:

- `src/main.tsx`
- `src/app/router.tsx`
- `src/app/layout/AppShell.tsx`
- `src/app/providers/ThemeProvider.tsx`

---

조립 단계. RecoilRoot + QueryClientProvider + ThemeProvider + RouterProvider.
라우트(verbatim 라우터가 기준): `/` → `/review` 리다이렉트, `/review`,
`/review/:paperId`, `/review/:paperId/analysis`, `/settings`, `*` NotFound.
(`/analysis` 단독 라우트는 없다 — 분석은 항상 논문 컨텍스트 하위.)
AppShell = Sidebar + Outlet + Toaster.


---

### 파일: `src/main.tsx` (30줄) — **verbatim, 글자 그대로 사용**

````tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { RecoilRoot } from "recoil";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { ThemeProvider } from "@/app/providers/ThemeProvider";
import { router } from "@/app/router";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RecoilRoot>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </QueryClientProvider>
    </RecoilRoot>
  </React.StrictMode>,
);
````

### 파일: `src/app/router.tsx` (23줄) — **verbatim, 글자 그대로 사용**

````tsx
import { createBrowserRouter, Navigate, type RouteObject } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { ReviewLoopPage } from "./routes/ReviewLoopPage";
import { AnalysisPage } from "./routes/AnalysisPage";
import { SettingsPage } from "./routes/SettingsPage";
import { NotFound } from "./routes/NotFound";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/review" replace /> },
      { path: "review", element: <ReviewLoopPage /> },
      { path: "review/:paperId", element: <ReviewLoopPage /> },
      { path: "review/:paperId/analysis", element: <AnalysisPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
````

### 파일: `src/app/layout/AppShell.tsx` (76줄) — **verbatim, 글자 그대로 사용**

````tsx
import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { PanelLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { Toaster } from "@/components/ui/Toaster";
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

  // The review page's own header doubles as the titlebar when the sidebar is
  // collapsed; every other route gets this fallback strip so the window stays
  // usable and the sidebar can be re-expanded.
  const isMac = isMacUA();
  const overlayTitlebar = useOverlayTitlebar();
  const pageOwnsTitlebar = useLocation().pathname.startsWith("/review");

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-text">
      <Sidebar />
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
      <Toaster />
    </div>
  );
}
````

### 파일: `src/app/providers/ThemeProvider.tsx` (12줄) — **verbatim, 글자 그대로 사용**

````tsx
import { useEffect, type ReactNode } from "react";
import { useRecoilValue } from "recoil";
import { themeState } from "@/lib/store";

/** Stamps data-theme on <html> so the CSS variable palettes switch. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useRecoilValue(themeState);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  return <>{children}</>;
}
````
