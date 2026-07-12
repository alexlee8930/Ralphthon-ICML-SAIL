# 55 · UI 프리미티브 (ConfirmDialog · Toaster · NotFound)

의존: 40-lib, design/10

산출 파일:

- `src/components/ui/ConfirmDialog.tsx`
- `src/components/ui/Toaster.tsx`
- `src/app/routes/NotFound.tsx`

---

공용 프리미티브. ConfirmDialog는 순수 div 오버레이 구현(삭제 확인 — radix 미사용),
Toaster는 lib/toast 버스 소비.


---

### 파일: `src/components/ui/ConfirmDialog.tsx` (59줄) — **verbatim, 글자 그대로 사용**

````tsx
import { useEffect } from "react";

/**
 * Minimal in-app confirmation dialog. Destructive actions confirm through this
 * so the flow is consistent (and styleable) across the app.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-label={title}
        className="w-[360px] rounded-card border border-border bg-surface p-4 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-medium text-text">{title}</div>
        <p className="mt-1.5 text-sm text-muted">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded-input border border-border px-3 py-1.5 text-sm text-text hover:bg-surface-2"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="rounded-input bg-error px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
````

### 파일: `src/components/ui/Toaster.tsx` (44줄) — **verbatim, 글자 그대로 사용**

````tsx
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
````

### 파일: `src/app/routes/NotFound.tsx` (15줄) — **verbatim, 글자 그대로 사용**

````tsx
import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
        <div className="text-lg text-text">404 — Not found</div>
        <div className="text-sm text-muted">This page does not exist.</div>
      </div>
      <Link to="/" className="text-sm text-link underline underline-offset-2">
        Back to workspace
      </Link>
    </div>
  );
}
````
