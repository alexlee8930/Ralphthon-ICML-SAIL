import { useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { subscribeToasts, type ToastItem } from "@/lib/toast";
import { cn } from "@/lib/cn";

/** Bottom-center stack of transient notifications (saved/failed, …). */
export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // Locally dismissed ids: the toast bus has no manual-dismiss API, so a click
  // hides it here until its own TTL drops it from the bus.
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  useEffect(() => subscribeToasts(setToasts), []);

  const visible = toasts.filter((t) => !dismissed.has(t.id));
  if (visible.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2">
      {visible.map((t) => {
        const isError = t.kind === "error";
        return (
          <button
            key={t.id}
            onClick={() => setDismissed((prev) => new Set(prev).add(t.id))}
            className={cn(
              "pointer-events-auto flex max-w-[70vw] items-center gap-2 rounded-card border px-3.5 py-2 text-sm shadow-card",
              isError
                ? "border-error/30 bg-surface text-error"
                : "border-ok/30 bg-surface text-text",
            )}
          >
            {isError ? (
              <XCircle size={15} className="shrink-0 text-error" />
            ) : (
              <CheckCircle2 size={15} className="shrink-0 text-ok" />
            )}
            <span className="truncate">{t.message}</span>
          </button>
        );
      })}
    </div>
  );
}
