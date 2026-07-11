import { NavLink } from "react-router-dom";
import { cn } from "@/lib/cn";

const PILL_BASE = "rounded-full px-2.5 py-1 text-xs transition-colors";
const pill = ({ isActive }: { isActive: boolean }) =>
  cn(PILL_BASE, isActive ? "bg-surface-2 text-text" : "text-muted hover:text-text");

/** Review ↔ Analysis switcher pills, shared by the loop view and the
 *  analysis page headers. */
export function ReviewTabs({ paperId }: { paperId: string }) {
  return (
    <nav aria-label="Paper views" className="flex shrink-0 items-center gap-1">
      <NavLink to={`/review/${paperId}`} end className={pill}>
        Review
      </NavLink>
      <NavLink to={`/review/${paperId}/analysis`} className={pill}>
        Analysis
      </NavLink>
    </nav>
  );
}
