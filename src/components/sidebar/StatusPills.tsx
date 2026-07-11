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
