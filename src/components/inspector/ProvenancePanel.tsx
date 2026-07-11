import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, MessageSquare, Package, RotateCcw, Terminal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUiStore } from "@/lib/store";
import { CodeViewer } from "@/components/code-viewer/CodeViewer";
import { DiffView } from "@/components/code-viewer/DiffView";
import { cn } from "@/lib/cn";

// ---- Local port of the `@ai4s/shared` provenance/run types (MIT). The web
// build has no provenance store yet, so the loaders below resolve empty —
// the panel shows its reference empty state and lights up unchanged once a
// backend provides records. ----

/** The environment a version was produced in — enough to reproduce. */
export interface ProvenanceEnv {
  /** Local Python version, e.g. "3.12.4". */
  python?: string;
  /** OS and architecture, e.g. "macos-aarch64". */
  platform: string;
  /** App version that recorded it. */
  app: string;
  /** Installed Python packages (pip freeze), content-addressed to a lockfile. */
  packages?: PackageSnapshot;
  /** Hardware the code executed on (CPU/GPU/accelerator). */
  hardware?: HardwareInfo;
}

export interface PackageSnapshot {
  /** Number of installed packages captured. */
  count: number;
  /** Short content hash; the lockfile is `.openscience/env/<hash>.txt`. */
  hash: string;
}

export interface HardwareInfo {
  cpu?: string;
  cores?: number;
  memGb?: number;
  gpu?: string[];
  accelerator?: string;
}

/** One recorded write of an artifact — a line in `.openscience/provenance.jsonl`. */
export interface ProvenanceRecord {
  /** Workspace-relative artifact path with `/` separators. */
  path: string;
  /** 1-based version, assigned on append. */
  version: number;
  /** Seconds since the epoch. */
  ts: number;
  /** Tool that produced this version, e.g. "write". */
  tool: string;
  sessionId?: string;
  /** Model configured when the version was recorded. */
  model?: string;
  /** Text the tool wrote (capped); absent for binary or indirect writes. */
  content?: string;
  /** Unified diff of an incremental edit, when the full content wasn't captured. */
  diff?: string;
  log?: string;
  /** Runtime environment captured when the version was recorded. */
  env?: ProvenanceEnv;
  /** The run that produced this version, when it came from executing code. */
  runId?: string;
}

/** A file referenced by a run — its code input or produced output. */
export interface RunArtifact {
  /** Workspace-relative path with `/` separators. */
  path: string;
  /** Short content hash; absent when the file was too large to hash. */
  hash?: string;
  /** Size in bytes. */
  size: number;
}

/** One experiment/analysis execution — the reproducibility recipe. */
export interface RunRecord {
  /** Short content+time id, e.g. "run_ab12cd34". */
  runId: string;
  /** Seconds since the epoch (run start). */
  ts: number;
  sessionId?: string;
  model?: string;
  /** The exact command that ran, e.g. "python train.py --lr 3e-4". */
  command: string;
  surface?: "local" | "hpc" | "modal" | "jupyter" | "ssh";
  host?: string;
  jobId?: string;
  remoteHardware?: string;
  status: "ok" | "failed";
  wallMs?: number;
  code?: RunArtifact[];
  outputs?: RunArtifact[];
  logHash?: string;
  env?: ProvenanceEnv;
}

// ---- Web data loaders: no local provenance store — resolve empty. ----

async function listProvenance(_path: string): Promise<ProvenanceRecord[]> {
  return [];
}

async function readEnvLockfile(_hash: string): Promise<string | null> {
  return null;
}

async function listRuns(): Promise<RunRecord[]> {
  return [];
}

/** The prompt the Reproduce action drafts — prefilled, reviewed, user-sent. */
export function reproducePrompt(r: ProvenanceRecord): string {
  const pkgs = r.env?.packages;
  const pkgNote = pkgs
    ? ` The environment had ${pkgs.count} installed Python packages, listed in \`.openscience/env/${pkgs.hash}.txt\` — if the regenerated result differs, install matching versions from that lockfile and re-run.`
    : "";
  const env = r.env
    ? ` It was produced with${r.env.python ? ` Python ${r.env.python} on` : ""} ${r.env.platform}.${pkgNote}`
    : "";
  const content = r.content ?? "";
  // A fence longer than any backtick run in the content, so embedded ``` in
  // the recorded code (e.g. a generated report.md) cannot close it early.
  const fence = "`".repeat(Math.max(3, longestBacktickRun(content) + 1));
  // Records are capped at 100 KB (provenance.rs cap_content) — a truncated
  // record is not runnable, so tell the agent where the full code lives.
  const truncNote = content.endsWith("[truncated]")
    ? " NOTE: the recorded code below is truncated at the store's size cap — read the full " +
      `record for \`${r.path}\` from \`.openscience/provenance.jsonl\` before re-running.`
    : "";
  return (
    `Reproduce \`${r.path}\` (provenance v${r.version}).${env} ` +
    `Re-run its recorded generating code below, then compare the regenerated file ` +
    `with the current \`${r.path}\` and report whether they match — and what changed if not.` +
    `${truncNote}\n\n${fence}\n${content}\n${fence}`
  );
}

function longestBacktickRun(text: string): number {
  let max = 0;
  for (const run of text.match(/`+/g) ?? []) max = Math.max(max, run.length);
  return max;
}

/** Private copy of the reference `lib/runs` reproduce-prompt drafting (MIT). */
export function reproduceRunPrompt(r: RunRecord): string {
  const env = r.env;
  const hw = env?.hardware;
  const parts: string[] = [];
  if (env) {
    const bits = [
      env.python && `Python ${env.python}`,
      env.platform,
      hw?.gpu?.length ? hw.gpu.join(", ") : hw?.accelerator,
      hw?.cpu,
    ].filter(Boolean);
    if (bits.length) parts.push(`It ran on ${bits.join(" · ")}.`);
    if (env.packages)
      parts.push(
        `The environment had ${env.packages.count} installed Python packages, pinned in \`.openscience/env/${env.packages.hash}.txt\` — install matching versions from that lockfile if the result differs.`,
      );
  }
  const code = fileList(r.code ?? []);
  if (code) parts.push(`The code version is pinned by hash: ${code} — check it hasn't changed since.`);
  const remote = r.surface === "hpc" || r.surface === "modal" || r.surface === "ssh";
  if (remote)
    parts.push(
      `This ran on ${
        r.surface === "hpc" ? "an HPC cluster" : r.surface === "modal" ? "Modal" : "a remote machine over SSH"
      }, so its outputs live off this machine and weren't captured locally.`,
    );
  const outputs = fileList(r.outputs ?? []);
  const compare = outputs
    ? `re-run it, then compare the regenerated outputs (${outputs}) against the recorded run and report whether they match — and what changed if not.`
    : remote
      ? `re-submit it and report whether it reproduces, fetching the remote outputs to compare.`
      : `re-run it and report whether it reproduces (no output files were captured for this run).`;
  return (
    `Reproduce run \`${r.runId}\`, which executed:\n\n    ${r.command}\n\n` +
    `${parts.join(" ")}${parts.length ? " " : ""}Recreate that environment, ${compare}`
  );
}

/** "a, b, c (+N more)" for a capped list of run files, or "" when empty. */
function fileList(files: RunArtifact[], cap = 6): string {
  if (files.length === 0) return "";
  const shown = files.slice(0, cap).map((f) => `\`${f.path}\``);
  const more = files.length > cap ? ` (+${files.length - cap} more)` : "";
  return shown.join(", ") + more;
}

function packageCount(count: number): string {
  return `${count} package${count === 1 ? "" : "s"}`;
}

/**
 * The provenance History of one artifact: every recorded version with the code
 * that produced it, the tool, the model, and a link back to the originating
 * conversation. Data comes from `.openscience/provenance.jsonl` (P0-3).
 */
export function ProvenancePanel({ path, language }: { path: string; language?: string }) {
  const [records, setRecords] = useState<ProvenanceRecord[] | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  // Runs a version can be produced by, keyed by runId — links a file to its recipe.
  const [runsById, setRunsById] = useState<Map<string, RunRecord>>(new Map());
  // The package lockfile currently shown, keyed by its content hash.
  const [lockfile, setLockfile] = useState<{ hash: string; text: string | null } | null>(null);
  const navigate = useNavigate();
  const { setComposerDraft } = useUiStore();

  // Toggle the pip-freeze lockfile for a snapshot hash; loads it lazily on open.
  const toggleLockfile = (hash: string) => {
    if (lockfile?.hash === hash) {
      setLockfile(null);
      return;
    }
    setLockfile({ hash, text: null });
    void readEnvLockfile(hash).then((text) =>
      setLockfile((cur) => (cur?.hash === hash ? { hash, text: text ?? "(lockfile unavailable)" } : cur)),
    );
  };

  // Draft a reproduce prompt into the conversation the version came from — the
  // user reviews and sends it (human in the loop, never auto-run). For a file
  // produced by a run, reproduce the RUN (re-run its command, compare outputs);
  // for an authored file, reproduce its recorded code.
  const reproduce = (r: ProvenanceRecord) => {
    const run = r.runId ? runsById.get(r.runId) : undefined;
    setComposerDraft(run ? reproduceRunPrompt(run) : reproducePrompt(r));
    navigate(r.sessionId ? `/live/${r.sessionId}` : "/live");
  };

  useEffect(() => {
    let cancelled = false;
    setRecords(null);
    void listProvenance(path).then((r) => {
      if (cancelled) return;
      setRecords([...r].reverse()); // newest first
      setExpanded(r.length > 0 ? r[r.length - 1].version : null);
      // Load the runs any of these versions were produced by, for the recipe.
      if (r.some((rec) => rec.runId)) {
        void listRuns().then((runs) => {
          if (cancelled) return;
          setRunsById(new Map(runs.map((run) => [run.runId, run])));
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (records === null) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted">
        <Loader2 size={15} className="animate-spin" /> Loading history…
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="p-4 text-sm text-muted">
        No versions recorded yet. Each time the agent writes{" "}
        <span className="font-mono text-text">{path}</span>
        , a version is added here with the code, model, and conversation that produced it.
      </div>
    );
  }

  return (
    <ul className="space-y-2 p-3">
      {records.map((r) => {
        const open = expanded === r.version;
        return (
          <li key={r.version} className="rounded-input border border-border bg-surface">
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
              onClick={() => setExpanded(open ? null : r.version)}
              aria-expanded={open}
            >
              {open ? (
                <ChevronDown size={14} className="shrink-0 text-muted" />
              ) : (
                <ChevronRight size={14} className="shrink-0 text-muted" />
              )}
              <span className="rounded bg-surface-2 px-1.5 text-xs font-medium text-text">
                v{r.version}
              </span>
              <span className="font-mono text-xs text-muted">{r.tool}</span>
              <span className="flex-1" />
              <span className="text-xs text-muted">{formatTs(r.ts)}</span>
            </button>
            {open && (
              <div className="space-y-2 border-t border-border px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  {r.model && (
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">{r.model}</span>
                  )}
                  {r.env && (
                    <span
                      className="rounded bg-surface-2 px-1.5 py-0.5 font-mono"
                      title="Environment this version was produced in"
                    >
                      {[r.env.python && `py ${r.env.python}`, r.env.platform, `app ${r.env.app}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                  {r.env?.packages && (
                    <button
                      className={cn(
                        "flex items-center gap-1 rounded px-1.5 py-0.5 font-mono hover:bg-surface-2 hover:text-text",
                        lockfile?.hash === r.env.packages.hash && "bg-surface-2 text-text",
                      )}
                      onClick={() => toggleLockfile(r.env!.packages!.hash)}
                      title="View the captured pip freeze lockfile for this version"
                      aria-pressed={lockfile?.hash === r.env.packages.hash}
                    >
                      <Package size={11} /> {packageCount(r.env.packages.count)}
                    </button>
                  )}
                  {r.log && <span className="truncate">{r.log}</span>}
                  <span className="flex-1" />
                  {(r.content || (r.runId && runsById.has(r.runId))) && (
                    <button
                      className="flex items-center gap-1 text-link hover:underline"
                      onClick={() => reproduce(r)}
                      title={
                        r.runId
                          ? "Draft a prompt that re-runs this file's run and compares the outputs"
                          : "Draft a prompt that re-runs this version's code and compares the result"
                      }
                    >
                      <RotateCcw size={12} /> Reproduce
                    </button>
                  )}
                  {r.sessionId && (
                    <button
                      className="flex items-center gap-1 text-link hover:underline"
                      onClick={() => navigate(`/live/${r.sessionId}`)}
                      title="Open the conversation this version came from"
                    >
                      <MessageSquare size={12} /> Open conversation
                    </button>
                  )}
                </div>
                {r.env?.packages && lockfile?.hash === r.env.packages.hash && (
                  <div className="rounded-input border border-border bg-surface-2">
                    <div className="border-b border-border px-2.5 py-1 text-[11px] text-muted">
                      pip freeze · {packageCount(r.env.packages.count)}
                    </div>
                    {lockfile.text === null ? (
                      <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted">
                        <Loader2 size={12} className="animate-spin" /> Loading…
                      </div>
                    ) : (
                      <pre className="max-h-48 overflow-auto px-2.5 py-2 font-mono text-[11px] leading-relaxed text-text">
                        {lockfile.text}
                      </pre>
                    )}
                  </div>
                )}
                {r.content ? (
                  <CodeViewer code={r.content} language={language} />
                ) : r.diff ? (
                  <DiffView diff={r.diff} className="max-h-80 overflow-y-auto" />
                ) : r.runId ? (
                  <div className="flex items-start gap-2 rounded-input border border-border bg-surface-2 px-2.5 py-2 text-xs text-muted">
                    <Terminal size={13} className="mt-0.5 shrink-0" />
                    <span>
                      Produced by run{" "}
                      <button
                        className="font-mono text-link hover:underline"
                        onClick={() => navigate(`/runs?run=${r.runId}`)}
                        title="Open this run in the Runs view"
                      >
                        {r.runId}
                      </button>
                      {runsById.get(r.runId) && (
                        <>
                          {" — "}
                          <span className="font-mono text-text">{runsById.get(r.runId)!.command}</span>
                        </>
                      )}
                      . This file is an output of running code; Reproduce re-runs that command and compares the result.
                    </span>
                  </div>
                ) : (
                  <div className={cn("text-xs text-muted")}>
                    Content not captured for this version (a binary write, or an edit that recorded only a diff).
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function formatTs(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleString("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
