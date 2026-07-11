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
