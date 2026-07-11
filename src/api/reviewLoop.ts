/**
 * Review-loop API — the product flow from the design discussion:
 * paper in → the 3-head model scores it on a 0–100 scale → if the score sits
 * in the award-similar band it is SELECTED and the loop ends; otherwise an
 * AC-style review (≈6–7 comments) is produced, the author revises (one-click
 * AI revision via the agent, or manual upload) which bumps the version, the
 * new version is rescored, and the loop repeats until selection.
 *
 * A submission carries the manuscript itself — pasted full text, an uploaded
 * PDF, or both — and every version keeps its own manuscript snapshot so the
 * version rail can page through what the model actually read.
 *
 * When VITE_RALPH_API_URL is set every call maps 1:1 onto the backend:
 *   POST /api/loop/papers                      → submit (v1)
 *   GET  /api/loop/papers                      → list
 *   GET  /api/loop/papers/:id                  → full loop state
 *   POST /api/loop/papers/:id/revise           → AI revision (new version + rescore + review)
 *   POST /api/loop/papers/:id/versions         → manual revision upload (multipart)
 * The backend returns a manuscript {kind, text|url, fileName} per version.
 * Until then the mock below simulates the loop deterministically.
 */

export type LoopStatus = "scoring" | "in_review" | "selected";

/** Score from the selection head, rescaled to the 0–100 scale (100 = 만점). */
export interface LoopScore {
  version: number;
  /** 0–100. */
  score: number;
  /** Papers scoring at or above this band read as award-similar → SELECT. */
  selectThreshold: number;
  gradeTier: "reject" | "poster" | "spotlight" | "oral" | "notable-top-5%";
  /** S6: which features pushed the score up or down (weights sum ≈ ±1). */
  attributions: Array<{ feature: string; weight: number }>;
}

export type CommentSeverity = "major" | "minor" | "question";

/** One AC-style review comment — rendered like an issue-tracker comment. */
export interface ReviewComment {
  id: string;
  version: number;
  severity: CommentSeverity;
  section: string;
  body: string;
  /** Set when a later revision addressed this comment. */
  resolvedInVersion?: number;
}

/** The manuscript a version was scored on. Text submissions carry the full
 *  text (AI revisions append a "Revision notes" section per round); PDF
 *  submissions carry an object/remote URL for rendering plus the accumulated
 *  revision notes in `text`. */
export interface LoopManuscript {
  kind: "text" | "pdf";
  /** kind 'text': the full manuscript text. kind 'pdf': accumulated revision notes. */
  text?: string;
  /** kind 'pdf' only. */
  fileName?: string;
  /** kind 'pdf' only — object URL (mock) or backend file URL. */
  url?: string;
}

export interface LoopVersion {
  version: number;
  createdAt: string;
  origin: "upload" | "ai_revision";
  /** What the revision changed — the agent's summary of its edits. */
  changeNote?: string;
  /** The manuscript this version was scored on. */
  manuscript: LoopManuscript;
  score: LoopScore;
  comments: ReviewComment[];
}

export interface LoopPaper {
  id: string;
  title: string;
  abstract: string;
  status: LoopStatus;
  currentVersion: number;
  versions: LoopVersion[];
  createdAt: string;
}

/** Submission = title + manuscript, where the manuscript is pasted full text
 *  (abstract folded into `text`), an attached PDF, or both. */
export interface SubmitLoopPaperInput {
  title: string;
  /** Full manuscript text (the abstract is part of it). */
  text?: string;
  /** Uploaded manuscript PDF. */
  file?: File;
}

// ---------------------------------------------------------------------------
// Mock simulation
// ---------------------------------------------------------------------------

const BASE = import.meta.env.VITE_RALPH_API_URL as string | undefined;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();
let seq = 1;

const SELECT_THRESHOLD = 88;

/** Comment templates per round — each revision resolves most of the previous
 *  round and surfaces fewer, narrower concerns (matching the 3–4 round loop). */
const ROUND_COMMENTS: Array<Array<[CommentSeverity, string, string]>> = [
  [
    ["major", "Method", "The central claim is not isolated: the gains could come from the auxiliary loss rather than the proposed head. Add an ablation that removes only the head."],
    ["major", "Experiments", "All results use a single seed. Report mean ± std over ≥3 seeds for the main tables."],
    ["major", "Related work", "The comparison omits the strongest recent baseline; without it the improvement claim is not supported."],
    ["minor", "Figures", "Figure 2 axis labels are unreadable at print size; regenerate at higher resolution with larger fonts."],
    ["minor", "Writing", "Section 3 mixes notation (x vs x̃) — unify and add a notation table."],
    ["question", "Method", "How does the approach behave when the score head is trained on a different venue distribution?"],
    ["question", "Experiments", "What is the wall-clock overhead of the additional heads at inference time?"],
  ],
  [
    ["major", "Experiments", "The new ablation isolates the head on two of three suites — the third still conflates both changes. Complete the ablation for suite C."],
    ["minor", "Method", "Prop. 2 assumes stationary dynamics; scope the claim explicitly or soften the statement."],
    ["minor", "Figures", "The new Figure 6 legend overlaps the curve for the largest model; nudge the legend outside the axes."],
    ["question", "Experiments", "Do the multi-seed results hold for the largest backbone as well?"],
    ["minor", "Writing", "The contribution list in the introduction now overstates the theory result relative to §5."],
    ["question", "Reproducibility", "Will the training scripts for the scoring head be released?"],
  ],
  [
    ["minor", "Experiments", "Suite-C ablation added — remaining gap is a confidence interval on the aggregate metric."],
    ["minor", "Writing", "Abstract still promises 'theoretical guarantees'; the body now (correctly) claims a scoped result."],
    ["question", "Figures", "Consider a summary figure comparing all three suites at a glance."],
  ],
];

function scoreForRound(round: number): number {
  // v1 lands well below the band; each AI revision closes most of the gap and
  // the third version crosses the selection threshold (3–4 round loop).
  const trajectory = [64, 78, 91, 96];
  return trajectory[Math.min(round, trajectory.length - 1)];
}

function tierFor(score: number): LoopScore["gradeTier"] {
  if (score >= 95) return "notable-top-5%";
  if (score >= 88) return "oral";
  if (score >= 78) return "spotlight";
  if (score >= 60) return "poster";
  return "reject";
}

function attributionsFor(round: number): LoopScore["attributions"] {
  // Early rounds: strong negative drivers; later rounds they shrink/flip.
  const negatives = [
    [
      { feature: "ablation completeness", weight: -0.31 },
      { feature: "empirical breadth", weight: -0.22 },
      { feature: "figure quality", weight: -0.11 },
    ],
    [
      { feature: "ablation completeness", weight: -0.14 },
      { feature: "theory rigor", weight: -0.12 },
    ],
    [{ feature: "empirical breadth", weight: -0.06 }],
    [],
  ];
  const neg = negatives[Math.min(round, negatives.length - 1)];
  const pos = [
    { feature: "novelty of contribution", weight: 0.29 },
    { feature: "clarity of writing", weight: 0.18 + round * 0.04 },
    { feature: "reproducibility detail", weight: 0.1 + round * 0.05 },
  ];
  return [...pos, ...neg];
}

function commentsFor(paperId: string, round: number, version: number): ReviewComment[] {
  const set = ROUND_COMMENTS[Math.min(round, ROUND_COMMENTS.length - 1)];
  return set.map(([severity, section, body], i) => ({
    id: `${paperId}_v${version}_c${i}`,
    version,
    severity,
    section,
    body,
  }));
}

const CHANGE_NOTES = [
  "Added the head-only ablation (Table 6), reran the main tables over 3 seeds, regenerated Figure 2 at print resolution, unified notation, and answered both reviewer questions in §A.3.",
  "Completed the suite-C ablation, scoped Prop. 2 to the stationary case, fixed the Figure 6 legend, aligned the contribution list with §5, and committed to releasing training scripts.",
  "Added confidence intervals to the aggregate metric, reworded the abstract to the scoped claim, and added the cross-suite summary figure (Fig. 10).",
];

const changeNoteFor = (version: number) =>
  CHANGE_NOTES[Math.min(version - 2, CHANGE_NOTES.length - 1)];

/** The appended "Revision notes" section for a revised manuscript — the
 *  change-note copy broken into one concrete edit per line. */
function revisionNotesSection(version: number, note: string): string {
  const edits = note
    .replace(/\.\s*$/, "")
    .split(/,\s+(?:and\s+)?/)
    .map((e) => `- ${e.charAt(0).toUpperCase()}${e.slice(1)}`);
  return `## Revision notes (v${version})\n\n${edits.join("\n")}`;
}

/** What the AI revision does to the manuscript: text manuscripts grow a
 *  revision-notes section (so switching versions visibly changes the text);
 *  PDF manuscripts keep the same file/url but accumulate the notes in `text`. */
function reviseManuscript(prev: LoopManuscript, version: number): LoopManuscript {
  const section = revisionNotesSection(version, changeNoteFor(version));
  const text = prev.text ? `${prev.text}\n\n---\n\n${section}` : section;
  return prev.kind === "pdf"
    ? { kind: "pdf", url: prev.url, fileName: prev.fileName, text }
    : { kind: "text", text };
}

function manuscriptForSubmission(input: SubmitLoopPaperInput): LoopManuscript {
  // A PDF is the authoritative manuscript when attached; pasted text (if any)
  // rides along as notes text. Text-only submissions render the text itself.
  if (input.file) {
    return {
      kind: "pdf",
      url: URL.createObjectURL(input.file),
      fileName: input.file.name,
      text: input.text?.trim() || undefined,
    };
  }
  return { kind: "text", text: input.text ?? "" };
}

function makeVersion(
  paperId: string,
  version: number,
  origin: LoopVersion["origin"],
  manuscript: LoopManuscript,
): LoopVersion {
  const round = version - 1;
  const score = scoreForRound(round);
  return {
    version,
    createdAt: now(),
    origin,
    changeNote: origin === "ai_revision" ? changeNoteFor(version) : undefined,
    manuscript,
    score: {
      version,
      score,
      selectThreshold: SELECT_THRESHOLD,
      gradeTier: tierFor(score),
      attributions: attributionsFor(round),
    },
    comments: score >= SELECT_THRESHOLD ? [] : commentsFor(paperId, round, version),
  };
}

function resolveOldComments(paper: LoopPaper, newVersion: number) {
  // A revision addresses every open comment from the previous version except
  // the ones the next round re-raises (the mock keeps it simple: resolve all).
  for (const v of paper.versions) {
    for (const c of v.comments) {
      if (!c.resolvedInVersion && c.version < newVersion) c.resolvedInVersion = newVersion;
    }
  }
}

const loopPapers: LoopPaper[] = [];

// A finished demo paper so the list view has one worked example.
(function seedDemo() {
  const demoText = `# Retrieval-Augmented Curriculum Distillation for Small Models

## Abstract

We distill retrieval-augmented teachers into compact students using a curriculum ordered by retrieval confidence, matching teacher quality on 5 of 7 tasks at 12x lower cost.

## 1. Introduction

Large retrieval-augmented models set the quality bar on knowledge-intensive tasks, but their inference cost keeps them out of most production stacks. We ask whether the ordering of distillation examples — not just their volume — determines how much of the teacher's retrieval-grounded ability a compact student inherits.

## 2. Method

We order the distillation set by the teacher's retrieval confidence and anneal from high-confidence (parametric-friendly) examples toward low-confidence (retrieval-dependent) ones. A lightweight consistency head penalizes students that drift from the teacher's cited evidence.

## 3. Experiments

Across seven knowledge-intensive benchmarks, the curriculum-distilled 1.3B student matches the 13B retrieval-augmented teacher on five tasks while running at 12x lower serving cost. Ablations attribute most of the gain to the confidence ordering rather than the consistency head.

## 4. Discussion

Confidence-ordered curricula appear to transfer the teacher's *decision to rely on retrieval*, not just its answers — students learn when to defer to evidence.`;
  const p: LoopPaper = {
    id: "lp_demo",
    title: "Retrieval-Augmented Curriculum Distillation for Small Models",
    abstract:
      "We distill retrieval-augmented teachers into compact students using a curriculum ordered by retrieval confidence, matching teacher quality on 5 of 7 tasks at 12x lower cost.",
    status: "selected",
    currentVersion: 3,
    versions: [],
    createdAt: "2026-07-09T05:00:00Z",
  };
  let manuscript: LoopManuscript = { kind: "text", text: demoText };
  p.versions = [1, 2, 3].map((v) => {
    if (v > 1) manuscript = reviseManuscript(manuscript, v);
    return makeVersion(p.id, v, v === 1 ? "upload" : "ai_revision", manuscript);
  });
  resolveOldComments(p, 2);
  resolveOldComments(p, 3);
  loopPapers.push(p);
})();

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw new Error(`API ${res.status} ${path}`);
  return (await res.json()) as T;
}

export const loopApi = {
  usingMock: !BASE,

  async list(): Promise<LoopPaper[]> {
    if (BASE) return http("/api/loop/papers");
    await delay(150);
    return [...loopPapers];
  },

  async get(id: string): Promise<LoopPaper> {
    if (BASE) return http(`/api/loop/papers/${id}`);
    await delay(150);
    const p = loopPapers.find((x) => x.id === id);
    if (!p) throw new Error(`paper ${id} not found`);
    return structuredClone(p);
  },

  /** Submit → the model scores v1 (and reviews it when it falls short).
   *  Requires a title AND a manuscript (pasted text or attached PDF). */
  async submit(input: SubmitLoopPaperInput): Promise<LoopPaper> {
    if (!input.title.trim() || (!input.text?.trim() && !input.file)) {
      throw new Error("A title and a manuscript (text or PDF) are required.");
    }
    if (BASE) {
      const form = new FormData();
      form.set("title", input.title);
      if (input.file) form.set("file", input.file);
      if (input.text) form.set("text", input.text);
      return http("/api/loop/papers", { method: "POST", body: form });
    }
    await delay(1400); // scoring pass
    const id = `lp_${seq++}`;
    const p: LoopPaper = {
      id,
      title: input.title,
      abstract: (input.text ?? "").trim().slice(0, 280),
      status: "in_review",
      currentVersion: 1,
      versions: [makeVersion(id, 1, "upload", manuscriptForSubmission(input))],
      createdAt: now(),
    };
    p.status = p.versions[0].score.score >= SELECT_THRESHOLD ? "selected" : "in_review";
    loopPapers.unshift(p);
    return structuredClone(p);
  },

  /** One-click AI revision: the agent edits the paper per the open review,
   *  the new version is rescored, and — if still short — re-reviewed. */
  async revise(id: string): Promise<LoopPaper> {
    if (BASE) return http(`/api/loop/papers/${id}/revise`, { method: "POST" });
    await delay(1800); // revise + rescore pass
    const p = loopPapers.find((x) => x.id === id);
    if (!p) throw new Error(`paper ${id} not found`);
    if (p.status === "selected") return structuredClone(p);
    const nextV = p.currentVersion + 1;
    const prevManuscript = p.versions[p.versions.length - 1].manuscript;
    p.versions.push(makeVersion(p.id, nextV, "ai_revision", reviseManuscript(prevManuscript, nextV)));
    resolveOldComments(p, nextV);
    p.currentVersion = nextV;
    p.status = p.versions[nextV - 1].score.score >= SELECT_THRESHOLD ? "selected" : "in_review";
    return structuredClone(p);
  },
};
