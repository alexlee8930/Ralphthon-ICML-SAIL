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
 * Adapter v1 (2026-07-11) text-extracts PDF submissions server-side (pymupdf)
 * and returns them as kind "text" — ManuscriptPane switches on `kind`, so
 * these render as the text view. kind "pdf" + `url` stays for the mock and
 * for a future PDF-serving endpoint (GET .../versions/:v/pdf).
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
  /** S6: which features pushed the score up or down (weights sum ≈ ±1).
   *  `evidence` = exact manuscript sentences that drove the feature
   *  (input-attribution spans, resolved to sentences by the backend). */
  attributions: Array<{ feature: string; weight: number; evidence?: string[] }>;
  /** Mean activation summary per backbone layer block (12 blocks, 0-1) —
   *  feeds the score-bottleneck visualization; the bottleneck sits after
   *  block 8 (index 7) where the scalar score neuron is read out. */
  layers: number[];
}

export type CommentSeverity = "major" | "minor" | "question";

/** S1 (review head): one independent reviewer's take on a version. Three run
 *  in parallel; the meta-review head (S3) synthesizes them. */
export interface ReviewerReview {
  id: string;
  /** Display name — "Reviewer 1" style. */
  reviewer: string;
  /** ICML-style overall rating, 1–10. */
  rating: number;
  summary: string;
}

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
 *  text (AI revisions append a "Revision notes" section per round). PDF
 *  handling differs by backend — see the module header. */
export interface LoopManuscript {
  kind: "text" | "pdf";
  /** kind 'text': the full manuscript text (for PDF submissions on the real
   *  API: the server-extracted text). kind 'pdf' (mock): accumulated revision notes. */
  text?: string;
  /** Original uploaded file name, when known. */
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
  /** S1: the parallel per-reviewer reviews the meta-review synthesizes. */
  reviews?: ReviewerReview[];
  /** S3: the meta-review head's synthesis of the reviews — the AC narrative
   *  the structured `comments` are extracted from. */
  metaReview?: string;
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

import { deleteStoredPaper, loadStoredPapers, persistPaper } from "./loopStorage";

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
  [
    ["minor", "Experiments", "Confidence intervals landed for two of three suites; add the third for completeness."],
    ["minor", "Related work", "Discuss the concurrent work released after submission — a paragraph suffices."],
    ["question", "Writing", "Should the intro's contribution ordering mirror §5's presentation order?"],
  ],
  [
    ["minor", "Experiments", "A single aggregate confidence interval remains missing on the cross-suite figure."],
    ["minor", "Writing", "One residual x̃ notation inconsistency in Appendix B."],
  ],
];

/** S1 review head output per round: [reviewer, rating 1–10, summary]. The
 *  three reviewers run every round in parallel and converge as revisions land. */
const ROUND_REVIEWS: Array<Array<[string, number, string]>> = [
  [
    ["Reviewer 1", 4, "The core idea is genuinely interesting and the writing is clear, but the central claim is not isolated from the auxiliary loss — without a head-only ablation I cannot attribute the gains."],
    ["Reviewer 2", 5, "Solid contribution with a plausible mechanism. My main reservation is experimental rigor: single-seed results and a missing strong baseline make the tables hard to trust."],
    ["Reviewer 3", 4, "The comparison omits the strongest recent baseline, and several figures are illegible at print size. The method may be sound, but the current evidence does not support the improvement claim."],
  ],
  [
    ["Reviewer 1", 5, "The new head-only ablation addresses my main concern on two of three suites — completing suite C would settle attribution fully."],
    ["Reviewer 2", 6, "Multi-seed tables and the added baseline resolve my biggest rigor concern. Prop. 2 still assumes stationary dynamics without saying so; scope it explicitly."],
    ["Reviewer 3", 5, "Figures are fixed and the baseline is in. The contribution list now slightly overstates the theory result relative to what §5 proves."],
  ],
  [
    ["Reviewer 1", 6, "Suite-C ablation completes the attribution story. What remains on my side is statistical: a confidence interval on the aggregate metric."],
    ["Reviewer 2", 6, "The scoped Prop. 2 statement is now accurate. The abstract still promises slightly more theory than the body delivers."],
    ["Reviewer 3", 6, "The revision materially improved the evidence. I'd like the cross-suite summary figure the authors deferred."],
  ],
  [
    ["Reviewer 1", 7, "Confidence intervals landed for two of three suites — add the third and my concerns are closed."],
    ["Reviewer 2", 7, "Abstract wording now matches §5. Consider discussing the concurrent work released after submission."],
    ["Reviewer 3", 6, "The summary figure is in and reads well. Contribution ordering in the intro could still mirror §5's order."],
  ],
  [
    ["Reviewer 1", 7, "Only the aggregate confidence interval on the cross-suite figure remains from my list."],
    ["Reviewer 2", 8, "Concurrent work is now discussed fairly; my concerns are fully addressed."],
    ["Reviewer 3", 7, "One residual notation inconsistency in Appendix B — otherwise this is a careful, complete paper."],
  ],
  [
    ["Reviewer 1", 8, "The aggregate CI is in; the attribution and rigor stories are complete. I recommend selection."],
    ["Reviewer 2", 8, "All concerns across five rounds are resolved with care. This is a strong, careful paper."],
    ["Reviewer 3", 8, "The revision trajectory is exemplary — evidence now fully supports the claims."],
  ],
  [
    ["Reviewer 1", 9, "Comprehensive and rigorous — among the strongest submissions in my batch."],
    ["Reviewer 2", 9, "Every earlier issue is resolved with care. I recommend highlighting this work."],
    ["Reviewer 3", 8, "A model revision trajectory; the final version is clearly award-quality."],
  ],
];

const reviewsForRound = (paperId: string, round: number, version: number): ReviewerReview[] =>
  ROUND_REVIEWS[Math.min(round, ROUND_REVIEWS.length - 1)].map(([reviewer, rating, summary], i) => ({
    id: `${paperId}_v${version}_r${i}`,
    reviewer,
    rating,
    summary,
  }));

/** The meta-review head needs accumulated rebuttal history (what the author
 *  contested and actually fixed, per revision) — it only writes once this many
 *  review turns have run. Before that, versions carry reviews but no synthesis. */
export const META_REVIEW_MIN_TURNS = 5;

/** S3: synthesize the meta-review from the actual loop history — issues
 *  raised/resolved across rounds, the AI-revision record (changeNotes), and
 *  the score trajectory. Returns undefined before enough turns accumulated. */
function synthesizeMetaReview(versions: LoopVersion[], current: LoopVersion): string | undefined {
  if (current.version < META_REVIEW_MIN_TURNS) return undefined;
  const history = versions.filter((v) => v.version <= current.version);
  const raised = history.reduce((n, v) => n + v.comments.length, 0);
  const resolved = history.reduce(
    (n, v) => n + v.comments.filter((c) => c.resolvedInVersion).length,
    0,
  );
  const revisions = history.filter((v) => v.origin === "ai_revision").length;
  const first = history[0].score.score;
  const last = current.score.score;
  const lastNote = current.changeNote ?? [...history].reverse().find((v) => v.changeNote)?.changeNote;
  const open = current.comments.filter((c) => !c.resolvedInVersion).length;
  const verdict =
    last >= current.score.selectThreshold
      ? "the committee places the paper in the award-similar band and recommends selection"
      : `the committee holds the paper below the selection band (${current.score.selectThreshold}) pending the remaining items`;
  return (
    `Meta-review after ${current.version} review turns. Across the preceding rounds the committee raised ${raised} issues; ` +
    `the authors rebutted or addressed ${resolved} of them over ${revisions} AI-assisted revisions, moving the score ${first} → ${last}. ` +
    (lastNote
      ? `Most recently the authors ${lastNote.charAt(0).toLowerCase()}${lastNote.slice(1).replace(/\.\s*$/, "")}. `
      : "") +
    (open > 0
      ? `${open} narrower concern${open === 1 ? "" : "s"} remain${open === 1 ? "s" : ""} open below — `
      : "No substantive concerns remain — ") +
    `${verdict}.`
  );
}

/** Attach the meta-review to the newest version once history allows it. */
function attachMetaReview(paper: LoopPaper) {
  const current = paper.versions[paper.versions.length - 1];
  current.metaReview = synthesizeMetaReview(paper.versions, current);
}

function scoreForRound(round: number): number {
  // v1 lands well below the band and each revision closes part of the gap.
  // Selection lands at v6 — after META_REVIEW_MIN_TURNS review turns, so the
  // meta-review (which needs rebuttal history) exists before the loop ends.
  const trajectory = [63, 69, 74, 79, 84, 91, 96];
  return trajectory[Math.min(round, trajectory.length - 1)];
}

function tierFor(score: number): LoopScore["gradeTier"] {
  if (score >= 95) return "notable-top-5%";
  if (score >= 88) return "oral";
  if (score >= 78) return "spotlight";
  if (score >= 60) return "poster";
  return "reject";
}

/** Keyword map: which manuscript sentences count as evidence per feature. */
const FEATURE_KEYWORDS: Record<string, RegExp> = {
  "novelty of contribution": /propose|novel|new|we ask|contribution/i,
  "clarity of writing": /abstract|section|we (study|present|show)/i,
  "reproducibility detail": /seed|release|script|code|detail/i,
  "figure quality": /figure|fig\.|plot|axis/i,
  "empirical breadth": /benchmark|suite|task|dataset|experiment/i,
  "ablation completeness": /ablation|isolat|remove|variant/i,
  "theory rigor": /prop\.|theorem|assum|proof|guarantee/i,
};

/** Pull up to two exact sentences from the manuscript matching the feature. */
function evidenceFor(text: string | undefined, feature: string): string[] {
  if (!text) return [];
  const re = FEATURE_KEYWORDS[feature];
  if (!re) return [];
  const sentences = text
    .replace(/^#+ .*$/gm, "")
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 30);
  return sentences.filter((x) => re.test(x)).slice(0, 2);
}

/** Backbone activation summary per version — rises through the stack and
 *  sharpens at the bottleneck block (index 7) as revisions improve. */
function layersFor(round: number): number[] {
  const boost = Math.min(round, 5) * 0.055;
  return Array.from({ length: 12 }, (_, i) => {
    const base = 0.25 + 0.045 * i;
    const bottleneck = i === 7 ? 0.18 : 0;
    const wobble = ((i * 37 + round * 13) % 10) / 100;
    return Math.min(1, Math.round((base + bottleneck + boost + wobble) * 100) / 100);
  });
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
      { feature: "ablation completeness", weight: -0.18 },
      { feature: "theory rigor", weight: -0.13 },
      { feature: "figure quality", weight: -0.05 },
    ],
    [
      { feature: "theory rigor", weight: -0.11 },
      { feature: "empirical breadth", weight: -0.08 },
    ],
    [
      { feature: "empirical breadth", weight: -0.07 },
      { feature: "theory rigor", weight: -0.05 },
    ],
    [{ feature: "empirical breadth", weight: -0.04 }],
    [],
  ];
  const neg = negatives[Math.min(round, negatives.length - 1)];
  const pos = [
    { feature: "novelty of contribution", weight: 0.29 },
    { feature: "clarity of writing", weight: 0.18 + Math.min(round, 4) * 0.03 },
    { feature: "reproducibility detail", weight: 0.1 + Math.min(round, 4) * 0.04 },
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
  "Added confidence intervals for two suites, reworded the abstract to the scoped claim, and added the cross-suite summary figure (Fig. 10).",
  "Added the remaining suite's confidence interval, discussed the concurrent work in related work, and reordered the intro's contribution list to mirror §5.",
  "Added the aggregate confidence interval to the cross-suite figure, and fixed the residual notation inconsistency in Appendix B.",
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
      attributions: attributionsFor(round).map((a) => ({
        ...a,
        evidence: evidenceFor(manuscript.kind === "text" ? manuscript.text : undefined, a.feature),
      })),
      layers: layersFor(round),
    },
    reviews: reviewsForRound(paperId, round, version),
    // metaReview is attached afterwards (attachMetaReview) — it needs the
    // paper's accumulated history, not just this version.
    // Comments keep flowing even in the selected/best-paper band — SELECTED
    // is a status, not a stop.
    comments: commentsFor(paperId, round, version),
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

/** The demo seed is code-defined, so deleting it needs a tombstone to stay
 *  deleted across reloads (regular papers just leave IndexedDB). */
const DEMO_HIDDEN_KEY = "sail-demo-hidden";
function demoHidden(): boolean {
  try {
    return localStorage.getItem(DEMO_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}
function hideDemoSeed() {
  try {
    localStorage.setItem(DEMO_HIDDEN_KEY, "1");
  } catch {
    // in-memory removal already happened; it will reappear next session
  }
}

// A finished demo paper so the list view has one worked example.
(function seedDemo() {
  if (demoHidden()) return;
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
    currentVersion: 6,
    versions: [],
    createdAt: "2026-07-09T05:00:00Z",
  };
  let manuscript: LoopManuscript = { kind: "text", text: demoText };
  for (let v = 1; v <= 6; v++) {
    if (v > 1) manuscript = reviseManuscript(manuscript, v);
    p.versions.push(makeVersion(p.id, v, v === 1 ? "upload" : "ai_revision", manuscript));
    if (v > 1) resolveOldComments(p, v);
    attachMetaReview(p);
  }
  loopPapers.push(p);
})();

/** Raw uploaded PDFs per paper (version → Blob) — persisted alongside the
 *  paper so object URLs can be re-issued after a reload. */
const pdfBlobsByPaper = new Map<string, Record<number, Blob>>();

/** Restore accumulated history (papers, reviews, manuscripts, PDF blobs) from
 *  IndexedDB once per session. The seeded demo stays code-defined. */
let hydration: Promise<void> | null = null;
function ensureHydrated(): Promise<void> {
  if (!hydration) {
    hydration = (async () => {
      const stored = await loadStoredPapers();
      let maxSeq = 0;
      for (const { paper, pdfBlobs } of stored) {
        if (paper.id === "lp_demo") continue;
        if (loopPapers.some((x) => x.id === paper.id)) continue;
        for (const v of paper.versions) {
          if (v.manuscript.kind === "pdf") {
            const blob = pdfBlobs?.[v.version];
            if (blob) v.manuscript.url = URL.createObjectURL(blob);
          }
        }
        pdfBlobsByPaper.set(paper.id, pdfBlobs ?? {});
        loopPapers.push(paper);
        const n = Number(paper.id.replace("lp_", ""));
        if (Number.isFinite(n)) maxSeq = Math.max(maxSeq, n);
      }
      seq = Math.max(seq, maxSeq + 1);
      // Newest first, demo pinned last among equals by its early createdAt.
      loopPapers.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    })();
  }
  return hydration;
}

function persist(p: LoopPaper) {
  if (p.id === "lp_demo") return;
  void persistPaper(p, pdfBlobsByPaper.get(p.id) ?? {});
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw new Error(`API ${res.status} ${path}`);
  return (await res.json()) as T;
}

export const loopApi = {
  usingMock: !BASE,

  async list(): Promise<LoopPaper[]> {
    if (BASE) return http("/api/loop/papers");
    await ensureHydrated();
    await delay(150);
    return [...loopPapers];
  },

  async get(id: string): Promise<LoopPaper> {
    if (BASE) return http(`/api/loop/papers/${id}`);
    await ensureHydrated();
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
    await ensureHydrated();
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
    attachMetaReview(p);
    if (input.file) pdfBlobsByPaper.set(id, { 1: input.file });
    loopPapers.unshift(p);
    persist(p);
    return structuredClone(p);
  },

  /** One-click AI revision: the agent edits the paper per the open review,
   *  the new version is rescored, and — if still short — re-reviewed. */
  async revise(id: string): Promise<LoopPaper> {
    if (BASE) return http(`/api/loop/papers/${id}/revise`, { method: "POST" });
    await ensureHydrated();
    await delay(1800); // revise + rescore pass
    const p = loopPapers.find((x) => x.id === id);
    if (!p) throw new Error(`paper ${id} not found`);
    const nextV = p.currentVersion + 1;
    const prevManuscript = p.versions[p.versions.length - 1].manuscript;
    p.versions.push(makeVersion(p.id, nextV, "ai_revision", reviseManuscript(prevManuscript, nextV)));
    resolveOldComments(p, nextV);
    p.currentVersion = nextV;
    p.status = p.versions[nextV - 1].score.score >= SELECT_THRESHOLD ? "selected" : "in_review";
    attachMetaReview(p);
    const blobs = pdfBlobsByPaper.get(p.id);
    if (blobs?.[nextV - 1]) blobs[nextV] = blobs[nextV - 1]; // same file, new version
    persist(p);
    return structuredClone(p);
  },

  /** Permanently delete a submission and its whole version history. */
  async remove(id: string): Promise<void> {
    if (BASE) {
      await http(`/api/loop/papers/${id}`, { method: "DELETE" });
      return;
    }
    await ensureHydrated();
    await delay(150);
    const idx = loopPapers.findIndex((x) => x.id === id);
    if (idx === -1) return;
    const [removed] = loopPapers.splice(idx, 1);
    for (const v of removed.versions) {
      if (v.manuscript.kind === "pdf" && v.manuscript.url) URL.revokeObjectURL(v.manuscript.url);
    }
    pdfBlobsByPaper.delete(id);
    if (id === "lp_demo") hideDemoSeed();
    else await deleteStoredPaper(id);
  },
};
