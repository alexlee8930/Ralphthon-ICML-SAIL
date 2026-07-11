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
