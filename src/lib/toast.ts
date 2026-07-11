/**
 * Tiny imperative toast bus (UI-ephemeral, so not part of Recoil app state).
 * Same call surface as the reference: toast("msg"), toast.error("msg").
 */
export type ToastKind = "info" | "ok" | "error";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

type Listener = (toasts: ToastItem[]) => void;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(items);
}

function push(kind: ToastKind, message: string, ttlMs = 3200) {
  const id = nextId++;
  items = [...items, { id, kind, message }];
  emit();
  window.setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, ttlMs);
}

export function toast(message: string) {
  push("info", message);
}
toast.ok = (message: string) => push("ok", message);
toast.error = (message: string) => push("error", message, 5200);

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(items);
  return () => listeners.delete(listener);
}
