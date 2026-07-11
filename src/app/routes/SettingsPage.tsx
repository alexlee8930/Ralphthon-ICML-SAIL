import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useUiStore } from "@/lib/store";
import { RemoteComputeCard } from "@/components/settings/RemoteComputeCard";
import { ModalCard } from "@/components/settings/ModalCard";
import { DataFlowCard } from "@/components/settings/DataFlowCard";
import { cn } from "@/lib/cn";

/** Models the Ralph reviewer can run on (display list — the real binding lives
 *  server-side, this only records the default). */
const MODELS: Array<{ group: string; models: Array<{ id: string; name: string }> }> = [
  {
    group: "Ralph (hosted)",
    models: [
      { id: "ralph/reviewer-v2", name: "Reviewer v2 (default)" },
      { id: "ralph/reviewer-lite", name: "Reviewer Lite" },
    ],
  },
  {
    group: "Bring your own",
    models: [
      { id: "anthropic/claude", name: "Anthropic Claude" },
      { id: "openai/gpt", name: "OpenAI GPT" },
      { id: "openrouter/auto", name: "OpenRouter (auto)" },
    ],
  },
];

/** The pipeline stages the reviewer runs, shown like the desktop provider list. */
const STAGES: Array<{ id: string; name: string; note: string }> = [
  { id: "s1", name: "S1 · Review", note: "review generation" },
  { id: "s2", name: "S2 · Discussion", note: "reviewer ↔ author" },
  { id: "s3", name: "S3 · Meta-review", note: "synthesis" },
  { id: "s4", name: "S4 · Scoring", note: "selectivity head" },
  { id: "s6", name: "S6 · Explanation", note: "deficiency report" },
];

/** Locales the UI ships with. Display-only on the web — the shipped build is
 *  English; the picker records intent without a runtime i18n switch. */
const LOCALES: Array<{ code: string; label: string; nativeName: string }> = [
  { code: "en", label: "English", nativeName: "English" },
  { code: "zh", label: "Chinese", nativeName: "中文" },
  { code: "ja", label: "Japanese", nativeName: "日本語" },
  { code: "ko", label: "Korean", nativeName: "한국어" },
];
const ACTIVE_LOCALE = "en";

/**
 * Settings. ONE configuration surface for the Ralph review service — the API it
 * talks to, the model behind the reviewer, appearance, and a plain-language
 * data-flow disclosure.
 */
export function SettingsPage() {
  const { theme, setTheme } = useUiStore();

  const [apiUrl, setApiUrl] = useState(
    (import.meta.env.VITE_RALPH_API_URL as string | undefined) ?? "http://127.0.0.1:8100",
  );
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(false);
  const [model, setModel] = useState("ralph/reviewer-v2");
  const status = checking ? "checking" : connected ? "ready" : "offline";

  // A connection is a real reachability check against the adapter, not a UI
  // toggle — the same /healthz the deployment exposes.
  const checkConnection = async (url: string) => {
    setChecking(true);
    try {
      const res = await fetch(`${url.replace(/\/+$/, "")}/healthz`, {
        signal: AbortSignal.timeout(5000),
      });
      setConnected(res.ok);
    } catch {
      setConnected(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (import.meta.env.VITE_RALPH_API_URL) void checkConnection(apiUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- probe once on mount
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-8 pb-16 pt-8">
        <h1 className="font-serif text-xl text-text">Settings</h1>
        <p className="mt-0.5 text-xs text-muted">Everything here configures how the workbench talks to the Ralph review service.</p>

        {/* ---- Review API ---- */}
        <Card title="Review API" hint="The Ralph review service, driven over its HTTP API">
          <div className="flex items-center gap-2">
            <input
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="http://127.0.0.1:8100"
              className={inputCls("flex-1 font-mono")}
            />
            {connected ? (
              <button onClick={() => setConnected(false)} className={btnGhost()}>
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => void checkConnection(apiUrl)}
                disabled={checking}
                className={btnAccent()}
              >
                {checking ? "Connecting…" : "Connect"}
              </button>
            )}
          </div>
          <div className="mt-2.5 flex items-center gap-1.5 text-xs text-muted">
            <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-ok" : "bg-muted")} />
            <span className="capitalize">{status}</span>
            {connected && model && (
              <>
                <span className="text-border">·</span>
                <span className="font-mono">{model}</span>
              </>
            )}
          </div>
        </Card>

        {/* ---- Model & pipeline ---- */}
        <Card title="Model" hint="The model the Ralph reviewer runs on">
          <div className="relative">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className={cn(inputCls("w-full appearance-none pr-9"), "cursor-pointer")}
            >
              {MODELS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -mt-[7px] text-muted" />
          </div>

          <Divider label="Pipeline stages" />

          <div className="overflow-hidden rounded-input border border-border">
            {STAGES.map((s, i) => (
              <div
                key={s.id}
                className={cn(
                  "flex h-10 items-center gap-2.5 bg-surface px-3 text-[13px]",
                  i > 0 && "border-t border-border",
                )}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok" />
                <span className="font-medium text-text">{s.name}</span>
                <span className="text-xs text-muted">{s.note}</span>
                <div className="flex-1" />
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted ring-1 ring-border">
                  built-in
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* ---- Data ---- */}
        <Card title="Data" hint="Local-first — papers, reviews, and scores are stored here">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                inputCls("flex-1 truncate font-mono leading-9"),
                "select-all bg-surface-2 text-muted",
              )}
            >
              {connected ? apiUrl : "browser (mock data)"}
            </span>
          </div>
        </Card>

        <RemoteComputeCard />

        <ModalCard />

        {/* ---- Privacy & data flow ---- */}
        <DataFlowCard model={connected ? model : null} workspace={connected ? apiUrl : null} />

        {/* ---- Appearance ---- */}
        <Card title="Appearance">
          <div className="inline-flex rounded-input border border-border bg-surface-2 p-0.5">
            {(["light", "dark"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setTheme(mode)}
                className={cn(
                  "rounded-[5px] px-4 py-1.5 text-[13px] transition-colors",
                  theme === mode ? "bg-surface text-text shadow-card" : "text-muted hover:text-text",
                )}
              >
                {mode === "light" ? "Light" : "Dark"}
              </button>
            ))}
          </div>
          <div className="mt-4">
            <div className="mb-2 text-xs font-medium text-muted">Language</div>
            <div role="group" aria-label="Language" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {LOCALES.map((l) => {
                const active = ACTIVE_LOCALE === l.code;
                return (
                  <div
                    key={l.code}
                    className={cn(
                      "rounded-input border px-2.5 py-2 text-left text-[13px] transition-colors",
                      active
                        ? "border-accent bg-accent/10 text-text shadow-sm"
                        : "border-border bg-surface text-muted",
                    )}
                    aria-pressed={active}
                  >
                    <span className="block truncate font-medium">{l.nativeName}</span>
                    <span className="block truncate text-[10.5px] text-muted">{l.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ---- Shared bits: one look for every control on this page ---- */

const inputCls = (extra = "") =>
  cn(
    "h-9 rounded-input border border-border bg-surface px-3 text-[13px] text-text outline-none",
    "placeholder:text-muted focus:border-accent/60",
    extra,
  );

const btnGhost = (extra = "") =>
  cn(
    "flex h-9 shrink-0 items-center gap-1 rounded-input border border-border bg-surface px-3.5",
    "text-[13px] text-text transition-colors hover:bg-surface-2 disabled:text-muted",
    extra,
  );

const btnAccent = (extra = "") =>
  cn(
    "flex h-9 shrink-0 items-center gap-1.5 rounded-input bg-accent px-3.5 text-[13px] font-medium",
    "text-accent-fg transition-colors hover:bg-accent/90 disabled:bg-accent/50",
    extra,
  );

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 rounded-card border border-border bg-surface shadow-card">
      <header className="border-b border-border px-5 py-3">
        <h2 className="font-serif text-[15px] text-text">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="mb-3 mt-5 flex items-center gap-3">
      <span className="text-xs font-medium uppercase tracking-wider text-muted">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
