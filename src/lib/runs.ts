/**
 * Run provenance — the reproducibility ledger for the Ralph review pipeline.
 *
 * Ported from Open Science Desktop (MIT). The desktop build read runs from a
 * SQLite index over `.openscience/runs.jsonl` via a Tauri bridge; the web build
 * has no local runtime, so the `@ai4s/shared` `RunRecord`/`RunArtifact` types
 * are inlined here and the queries resolve against a deterministic in-memory
 * dataset (the pipeline-stage executions for the demo papers). The query shape
 * — faceted, searchable, keyset-paginated — is preserved exactly so the Runs
 * page renders and behaves identically.
 */

/** The compute surface a run targeted. */
export type RunSurface = "local" | "hpc" | "modal" | "jupyter" | "ssh";

/** A file a run read (code) or produced (outputs). */
export interface RunArtifact {
  path: string;
  size: number;
}

export interface RunHardware {
  cpu?: string;
  gpu?: string[];
  accelerator?: string;
}

export interface RunEnv {
  python?: string;
  platform?: string;
  app?: string;
  hardware?: RunHardware;
  packages?: { count: number; hash: string };
}

/** One recorded experiment execution — the reproducibility recipe. */
export interface RunRecord {
  runId: string;
  command: string;
  status: "ok" | "failed";
  /** Epoch seconds the run finished. */
  ts: number;
  surface?: RunSurface;
  /** Wall-clock duration in ms. */
  wallMs?: number;
  sessionId?: string;
  env?: RunEnv;
  remoteHardware?: string;
  host?: string;
  jobId?: string;
  logHash?: string;
  code?: RunArtifact[];
  outputs?: RunArtifact[];
}

/** A keyset-paginated, faceted query over the runs index. */
export interface RunQuery {
  search?: string;
  status?: string;
  surface?: string;
  sessionId?: string;
  /** Time filter: only runs at or after this epoch-seconds instant. */
  sinceTs?: number;
  /** Keyset cursor from a previous page's `next`. */
  beforeTs?: number;
  beforeRowid?: number;
  limit?: number;
}

export interface RunFacet {
  value: string;
  count: number;
}

export interface RunPage {
  rows: RunRecord[];
  /** Total matching the full filter (for the header count). */
  total: number;
  facets: { status: RunFacet[]; surface: RunFacet[] };
  /** Cursor for the next (older) page; absent at the end. */
  next?: { ts: number; rowid: number };
}

// ---- Deterministic demo dataset --------------------------------------------
// Epoch-seconds timestamps are computed relative to now so day-grouping ("Today"
// / "Yesterday" / weekday) stays meaningful whenever the app is opened.

const NOW = Math.floor(Date.now() / 1000);
const H = 3600;
const D = 86_400;

const LOCAL_ENV: RunEnv = {
  python: "3.11",
  platform: "macos-arm64",
  app: "0.4.0",
  hardware: { cpu: "Apple M2 Max", accelerator: "MPS" },
  packages: { count: 214, hash: "a1b2c3d" },
};

const RAW_RUNS: RunRecord[] = [
  {
    runId: "r_s6_p1",
    command: "python s6_explain.py --paper p_demo1 --version 2",
    status: "ok",
    ts: NOW - 38 * 60,
    surface: "local",
    wallMs: 12_400,
    sessionId: "p_demo1",
    env: LOCAL_ENV,
    logHash: "log_s6",
    code: [{ path: "pipeline/s6_explain.py", size: 6120 }],
    outputs: [{ path: "papers/uncertainty-curriculum/explanation_s6.md", size: 2210 }],
  },
  {
    runId: "r_s4_p1",
    command: "python s4_score.py --paper p_demo1 --head selectivity",
    status: "ok",
    ts: NOW - 58 * 60,
    surface: "local",
    wallMs: 47_800,
    sessionId: "p_demo1",
    env: {
      ...LOCAL_ENV,
      hardware: { cpu: "Apple M2 Max", gpu: ["Apple M2 Max (38-core)"] },
    },
    logHash: "log_s4",
    code: [{ path: "pipeline/s4_score.py", size: 9840 }],
    outputs: [
      { path: "papers/uncertainty-curriculum/score_report.json", size: 1840 },
      { path: "papers/uncertainty-curriculum/attributions.csv", size: 4120 },
    ],
  },
  {
    runId: "r_s3_p1",
    command: "python s3_meta_review.py --paper p_demo1",
    status: "ok",
    ts: NOW - 72 * 60,
    surface: "local",
    wallMs: 61_200,
    sessionId: "p_demo1",
    env: LOCAL_ENV,
    logHash: "log_s3",
    code: [{ path: "pipeline/s3_meta_review.py", size: 7210 }],
    outputs: [{ path: "papers/uncertainty-curriculum/meta_review_s3.md", size: 4020 }],
  },
  {
    runId: "r_s2_p1",
    command: "python s2_discuss.py --paper p_demo1 --rounds 3",
    status: "ok",
    ts: NOW - 96 * 60,
    surface: "local",
    wallMs: 88_500,
    sessionId: "p_demo1",
    env: LOCAL_ENV,
    logHash: "log_s2",
    code: [{ path: "pipeline/s2_discuss.py", size: 8330 }],
    outputs: [{ path: "papers/uncertainty-curriculum/discussion_s2.md", size: 3120 }],
  },
  {
    runId: "r_s1_p1",
    command: "python s1_review.py --paper p_demo1 --version 2",
    status: "ok",
    ts: NOW - 2 * H,
    surface: "local",
    wallMs: 42_100,
    sessionId: "p_demo1",
    env: LOCAL_ENV,
    logHash: "log_s1",
    code: [{ path: "pipeline/s1_review.py", size: 8123 }],
    outputs: [{ path: "papers/uncertainty-curriculum/review_s1.md", size: 5210 }],
  },
  {
    runId: "r_s1_p2",
    command: "python s1_review.py --paper p_demo2 --version 1",
    status: "failed",
    ts: NOW - D - 2 * H,
    surface: "local",
    wallMs: 3_200,
    sessionId: "p_demo2",
    env: LOCAL_ENV,
    logHash: "log_s1_fail",
    code: [{ path: "pipeline/s1_review.py", size: 8123 }],
  },
  {
    runId: "r_train_p1",
    command: "sbatch train_selectivity_head.slurm",
    status: "ok",
    ts: NOW - 3 * D,
    surface: "hpc",
    sessionId: "p_demo1",
    host: "gpu-login01",
    jobId: "48213",
    remoteHardware: "4× A100 80GB",
  },
  {
    runId: "r_batch_p2",
    command: "modal run score_batch.py --split calibration",
    status: "ok",
    ts: NOW - 5 * D,
    surface: "modal",
    sessionId: "p_demo2",
    host: "ralph-scoring",
  },
];

// Attach a stable descending rowid so keyset pagination is deterministic.
const INDEXED = RAW_RUNS.map((r, i) => ({ run: r, rowid: RAW_RUNS.length - i }));

const LOGS: Record<string, string> = {
  log_s1:
    "$ python s1_review.py --paper p_demo1 --version 2\n[ok] loaded curriculum_v2.pdf (18 pages)\n[ok] extracted 42 claims, 6 figures, 11 citations\n[ok] wrote review_s1.md  5.1 KB\nfinished in 42.1s",
  log_s2:
    "$ python s2_discuss.py --paper p_demo1 --rounds 3\n[round 1] reviewer ↔ author — 4 threads opened\n[round 2] 2 threads resolved, 1 escalated\n[round 3] converged\n[ok] wrote discussion_s2.md\nfinished in 88.5s",
  log_s3:
    "$ python s3_meta_review.py --paper p_demo1\n[ok] synthesized 3 reviews + discussion\n[ok] agreement 0.81 · outstanding concerns: 1\n[ok] wrote meta_review_s3.md\nfinished in 61.2s",
  log_s4:
    "$ python s4_score.py --paper p_demo1 --head selectivity\n[ok] selectivity 0.61 · tier poster · decision accept\n[ok] award-proximity 0.18\n[ok] wrote score_report.json, attributions.csv\nfinished in 47.8s",
  log_s6:
    "$ python s6_explain.py --paper p_demo1 --version 2\n[ok] top attributions: novelty(+0.22), rigor(+0.14), clarity(+0.09)\n[ok] wrote explanation_s6.md\nfinished in 12.4s",
  log_s1_fail:
    "$ python s1_review.py --paper p_demo2 --version 1\n[warn] retrieval_heads.pdf: could not extract text layer (scanned)\nTraceback (most recent call last):\n  File \"s1_review.py\", line 91, in load_paper\n    claims = extract_claims(text)\nValueError: empty document — OCR required\n[failed] exit 1",
};

function matchesBase(r: RunRecord, q: RunQuery): boolean {
  if (q.sessionId && r.sessionId !== q.sessionId) return false;
  if (q.sinceTs != null && r.ts < q.sinceTs) return false;
  if (q.search) {
    const needle = q.search.toLowerCase();
    const inCommand = r.command.toLowerCase().includes(needle);
    const inOutputs = (r.outputs ?? []).some((f) => f.path.toLowerCase().includes(needle));
    if (!inCommand && !inOutputs) return false;
  }
  return true;
}

function matchesFacets(r: RunRecord, q: RunQuery): boolean {
  if (q.status && r.status !== q.status) return false;
  if (q.surface && (r.surface ?? "local") !== q.surface) return false;
  return true;
}

function facetCounts(rows: RunRecord[], pick: (r: RunRecord) => string): RunFacet[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = pick(r);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].map(([value, count]) => ({ value, count }));
}

/** Query the runs index (indexed, paginated, faceted). */
export async function queryRuns(query: RunQuery): Promise<RunPage> {
  const limit = query.limit ?? 50;
  // Facets reflect the base filter (search/session/since) independent of the
  // active status/surface selection, so chip counts stay stable while toggling.
  const base = INDEXED.filter(({ run }) => matchesBase(run, query));
  const facets = {
    status: facetCounts(base.map((x) => x.run), (r) => r.status),
    surface: facetCounts(base.map((x) => x.run), (r) => r.surface ?? "local"),
  };

  const full = base.filter(({ run }) => matchesFacets(run, query));
  // Newest first: ts desc, then rowid desc.
  full.sort((a, b) => b.run.ts - a.run.ts || b.rowid - a.rowid);

  const after = full.filter(({ run, rowid }) => {
    if (query.beforeTs == null || query.beforeRowid == null) return true;
    return run.ts < query.beforeTs || (run.ts === query.beforeTs && rowid < query.beforeRowid);
  });

  const page = after.slice(0, limit);
  const last = page[page.length - 1];
  const next =
    after.length > limit && last ? { ts: last.run.ts, rowid: last.rowid } : undefined;

  return { rows: page.map((x) => x.run), total: full.length, facets, next };
}

/** A run's captured stdout/stderr by its log hash (null if unreadable). */
export async function readRunLog(hash: string): Promise<string | null> {
  return LOGS[hash] ?? null;
}

/** The prompt the Reproduce action drafts for a run — prefilled, reviewed, and
 *  user-sent (human in the loop, never auto-run). Unlike reproducing a file,
 *  this re-runs the recorded COMMAND in the recorded environment and compares
 *  the regenerated OUTPUTS — real reproducibility, not re-authoring source. */
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
