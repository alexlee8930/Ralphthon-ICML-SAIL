/**
 * Review-loop API — contract v2 (cycle model), mirroring the real ICML process.
 *
 * One CYCLE = one submission to the venue:
 *   submit → 3 reviewer reviews (no score yet)
 *     → rebuttal thread (author messages incl. per-comment replies, reviewer
 *       follow-ups, hunk-level AI-revision decisions logged as rebuttal text)
 *     → finalize: the AC meta-review is written off the reviews + the whole
 *       discussion — ONLY THEN a score and an accept/reject decision appear
 *     → resubmit: the next cycle starts FRESH on the revised manuscript
 *       (new reviews, empty thread — like submitting to ICML again).
 *
 * When VITE_RALPH_API_URL is set every call maps 1:1 onto the backend
 * (icml-ac/serve/sail_adapter.py, contract v2); otherwise the mock below
 * simulates the loop deterministically and persists to IndexedDB.
 */

export type LoopStatus = "in_discussion" | "decided";
export type CycleDecision = "accept" | "reject";

/** One reviewer's review of a cycle (rating is ICML-style 1–10). */
export interface ReviewerReview {
  id: string;
  reviewer: string;
  rating: number;
  summary: string;
}

export type CommentSeverity = "major" | "minor" | "question";

/** A structured review issue — the anchor replies and revisions point at. */
export interface ReviewComment {
  id: string;
  cycle: number;
  /** Which reviewer raised it — targeted replies go back to them. */
  reviewer: string;
  severity: CommentSeverity;
  section: string;
  body: string;
}

/** One message in the rebuttal thread (chat). */
export interface CycleMessage {
  id: string;
  role: "author" | "reviewer" | "ac";
  author: string;
  body: string;
  /** A ReviewComment id (per-comment reply) or a CycleMessage id. */
  replyTo?: string;
  /** Set when the pending revised draft was delivered with this message. */
  attachment?: "revised-draft";
  createdAt: string;
}

/** One AI-proposed revision the author can allow or deny individually.
 *  `before` is an exact substring of the manuscript; `after` replaces it. */
export interface RevisionHunk {
  id: string;
  before: string;
  after: string;
  rationale: string;
  commentIds: string[];
  decision?: "allowed" | "denied";
}

export interface LoopScore {
  cycle: number;
  /** 0–100 — revealed only when the meta-review is written. */
  score: number;
  selectThreshold: number;
  gradeTier: "reject" | "poster" | "spotlight" | "oral" | "notable-top-5%";
  attributions: Array<{ feature: string; weight: number; evidence?: string[] }>;
  layers: number[];
}

export interface LoopManuscript {
  kind: "text" | "pdf";
  text?: string;
  fileName?: string;
  url?: string;
}

export interface LoopCycle {
  cycle: number;
  createdAt: string;
  manuscript: LoopManuscript;
  reviews: ReviewerReview[];
  comments: ReviewComment[];
  thread: CycleMessage[];
  /** AI revision draft awaiting per-hunk decisions. */
  pendingRevision?: { hunks: RevisionHunk[]; createdAt: string };
  /** Revised manuscript (applied hunks or manual edits) — rides as an
   *  attachment on the author's next message and seeds the next cycle. */
  draftManuscript?: string;
  /** The hunk allow/deny log — pre-fills the composer as draft rebuttal text. */
  revisionNote?: string;
  /** Set at finalize — the AC synthesis of reviews + discussion. */
  metaReview?: string;
  /** Set at finalize — score exists only alongside the meta-review. */
  score?: LoopScore;
  decision?: CycleDecision;
}

export interface LoopPaper {
  id: string;
  title: string;
  abstract: string;
  status: LoopStatus;
  currentCycle: number;
  cycles: LoopCycle[];
  createdAt: string;
}

export interface SubmitLoopPaperInput {
  title: string;
  text?: string;
  file?: File;
}

/** A long agent operation running server-side; the UI polls it and renders
 *  the event stream (harness steps + Claude thinking summaries) live. */
export interface AgentJobEvent {
  t: string;
  kind: "step" | "thinking";
  text: string;
}
export type AgentOp = "submit" | "reply" | "revision-draft" | "finalize" | "resubmit";
export interface AgentJob {
  id: string;
  op: AgentOp;
  status: "running" | "done" | "error";
  events: AgentJobEvent[];
  paperId?: string | null;
  error?: string | null;
}

// ---------------------------------------------------------------------------
// Mock simulation (no backend)
// ---------------------------------------------------------------------------

import { deleteStoredPaper, loadStoredPapers, persistPaper } from "./loopStorage";

const BASE = import.meta.env.VITE_RALPH_API_URL as string | undefined;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();
let seq = 1;

export const SELECT_THRESHOLD = 88;

const FALLBACK_REVIEWS: Array<[string, number, string, Array<[CommentSeverity, string, string]>]> = [
  [
    "Reviewer 1", 4,
    "The core idea is genuinely interesting and the writing is clear, but the central claim is not isolated from the auxiliary loss — without a head-only ablation I cannot attribute the gains.",
    [
      ["major", "Method", "The central claim is not isolated: the gains could come from the auxiliary loss rather than the proposed head. Add an ablation that removes only the head."],
      ["question", "Method", "How does the approach behave when the score head is trained on a different venue distribution?"],
    ],
  ],
  [
    "Reviewer 2", 5,
    "Solid contribution with a plausible mechanism. My main reservation is experimental rigor: single-seed results and a missing strong baseline make the tables hard to trust.",
    [
      ["major", "Experiments", "All results use a single seed. Report mean ± std over ≥3 seeds for the main tables."],
      ["major", "Related work", "The comparison omits the strongest recent baseline; without it the improvement claim is not supported."],
    ],
  ],
  [
    "Reviewer 3", 4,
    "Several figures are illegible at print size and the contribution list overstates the theory result. The method may be sound, but presentation undermines the evidence.",
    [
      ["minor", "Figures", "Figure 2 axis labels are unreadable at print size; regenerate at higher resolution."],
      ["minor", "Writing", "Section 3 mixes notation (x vs x̃) — unify and add a notation table."],
    ],
  ],
];

const CYCLE_SCORES = [63, 79, 91, 96];

function tierFor(score: number): LoopScore["gradeTier"] {
  if (score >= 95) return "notable-top-5%";
  if (score >= 88) return "oral";
  if (score >= 78) return "spotlight";
  if (score >= 60) return "poster";
  return "reject";
}

function layersFor(score: number): number[] {
  const base = 0.2 + 0.6 * (score / 100);
  return Array.from({ length: 12 }, (_, i) => {
    const wobble = ((i * 37 + score * 13) % 10) / 100;
    const bottleneck = i === 7 ? 0.15 : 0;
    return Math.min(1, Math.round((base * (0.7 + 0.03 * i) + bottleneck + wobble) * 100) / 100);
  });
}

function attributionsFor(text: string | undefined, score: number): LoopScore["attributions"] {
  const ev = (re: RegExp) => {
    if (!text) return [];
    return text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 30 && re.test(s))
      .slice(0, 2);
  };
  return [
    { feature: "novelty of contribution", weight: Math.round((0.2 + score / 500) * 100) / 100, evidence: ev(/propose|novel|new|contribution/i) },
    { feature: "clarity of writing", weight: 0.18, evidence: ev(/abstract|section|we (study|present|show)/i) },
    { feature: "empirical breadth", weight: Math.round(((score - 70) / 100) * 100) / 100, evidence: ev(/benchmark|dataset|experiment/i) },
    { feature: "ablation completeness", weight: Math.round(((score - 85) / 120) * 100) / 100, evidence: ev(/ablation|isolat|seed/i) },
  ];
}

function buildCycle(paperId: string, cycleNo: number, manuscript: LoopManuscript): LoopCycle {
  const reviews: ReviewerReview[] = [];
  const comments: ReviewComment[] = [];
  let ci = 0;
  FALLBACK_REVIEWS.forEach(([reviewer, rating, summary, cs], i) => {
    reviews.push({ id: `${paperId}_cy${cycleNo}_r${i}`, reviewer, rating, summary });
    for (const [severity, section, body] of cs) {
      comments.push({ id: `${paperId}_cy${cycleNo}_c${ci++}`, cycle: cycleNo, reviewer, severity, section, body });
    }
  });
  return { cycle: cycleNo, createdAt: now(), manuscript, reviews, comments, thread: [] };
}

function pushMsg(cyc: LoopCycle, role: CycleMessage["role"], author: string, body: string, replyTo?: string): CycleMessage {
  const m: CycleMessage = { id: `m${cyc.thread.length}_${cyc.cycle}`, role, author, body, createdAt: now() };
  if (replyTo) m.replyTo = replyTo;
  cyc.thread.push(m);
  return m;
}

function mockHunks(cyc: LoopCycle): RevisionHunk[] {
  const text = cyc.manuscript.text ?? "";
  const sents = text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 25);
  return sents.slice(0, 3).map((s, i) => ({
    id: `h${i}`,
    before: s,
    after: s.replace(/\.$/, "") + ", which we scope explicitly and support with a seed-reported ablation in the revision.",
    rationale: "Scopes the claim and ties it to the reviewers' rigor concerns.",
    commentIds: cyc.comments[i % Math.max(cyc.comments.length, 1)] ? [cyc.comments[i % cyc.comments.length].id] : [],
  }));
}

function mockFinalize(cyc: LoopCycle) {
  const score = CYCLE_SCORES[Math.min(cyc.cycle - 1, CYCLE_SCORES.length - 1)];
  const applied = cyc.pendingRevision?.hunks.filter((h) => h.decision === "allowed").length ?? 0;
  const denied = cyc.pendingRevision?.hunks.filter((h) => h.decision === "denied").length ?? 0;
  const meta =
    `Meta-review (cycle ${cyc.cycle}). The reviewers raised concerns about attribution, experimental rigor, ` +
    `and presentation. Across ${cyc.thread.length} discussion messages the authors engaged substantively, ` +
    `applying ${applied} revision(s) and declining ${denied} with stated reasons. ` +
    (score >= SELECT_THRESHOLD
      ? "The committee finds the remaining concerns narrow and recommends selection."
      : "Substantive concerns remain; the committee recommends revise-and-resubmit.");
  cyc.metaReview = meta;
  cyc.score = {
    cycle: cyc.cycle,
    score,
    selectThreshold: SELECT_THRESHOLD,
    gradeTier: tierFor(score),
    attributions: attributionsFor(cyc.manuscript.text, score),
    layers: layersFor(score),
  };
  cyc.decision = score >= SELECT_THRESHOLD ? "accept" : "reject";
  pushMsg(cyc, "ac", "Area Chair", meta);
}

function manuscriptForSubmission(input: SubmitLoopPaperInput): LoopManuscript {
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

const loopPapers: LoopPaper[] = [];

/** The demo seed is code-defined; deleting it uses a localStorage tombstone. */
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
    // in-memory removal already happened
  }
}

// A worked demo: cycle 1 rejected after a real-looking discussion, cycle 2
// (fresh submission of the revised draft) accepted.
(function seedDemo() {
  if (demoHidden()) return;
  const demoText = `# Retrieval-Augmented Curriculum Distillation for Small Models

## Abstract

We distill retrieval-augmented teachers into compact students using a curriculum ordered by retrieval confidence, matching teacher quality on 5 of 7 tasks at 12x lower cost.

## 1. Introduction

Large retrieval-augmented models set the quality bar on knowledge-intensive tasks, but their inference cost keeps them out of most production stacks. We ask whether the ordering of distillation examples determines how much of the teacher's retrieval-grounded ability a compact student inherits.

## 2. Method

We order the distillation set by the teacher's retrieval confidence and anneal from high-confidence examples toward low-confidence ones. A lightweight consistency head penalizes students that drift from the teacher's cited evidence.

## 3. Experiments

Across seven knowledge-intensive benchmarks, the curriculum-distilled 1.3B student matches the 13B retrieval-augmented teacher on five tasks while running at 12x lower serving cost. Ablations attribute most of the gain to the confidence ordering rather than the consistency head.`;
  const p: LoopPaper = {
    id: "lp_demo",
    title: "Retrieval-Augmented Curriculum Distillation for Small Models",
    abstract:
      "We distill retrieval-augmented teachers into compact students using a curriculum ordered by retrieval confidence.",
    status: "decided",
    currentCycle: 2,
    cycles: [],
    createdAt: "2026-07-09T05:00:00Z",
  };
  const c1 = buildCycle(p.id, 1, { kind: "text", text: demoText });
  const authorMsg = pushMsg(c1, "author", "Author", "Thank you for the careful reviews. On the attribution concern: our ablations in §3 already separate the ordering from the consistency head — we will make this table explicit and add the head-only variant.", c1.comments[0].id);
  pushMsg(c1, "reviewer", "Reviewer 1", "Thanks — an explicit head-only column would settle my main concern. Until it is in the manuscript I keep my rating, but I am open to raising it in the final justification.", authorMsg.id);
  c1.pendingRevision = { hunks: mockHunks(c1).map((h, i) => ({ ...h, decision: i === 0 ? "allowed" : "denied" })), createdAt: now() };
  const applied = c1.pendingRevision.hunks[0];
  c1.draftManuscript = (c1.manuscript.text ?? "").replace(applied.before, applied.after);
  const revMsg = pushMsg(c1, "author", "Author", `We revised the manuscript as follows: (1) ${applied.rationale} We considered but did not adopt: (1) ${c1.pendingRevision.hunks[1]?.rationale ?? ""}`);
  revMsg.attachment = "revised-draft";
  mockFinalize(c1);
  const c2 = buildCycle(p.id, 2, { kind: "text", text: c1.draftManuscript });
  c2.reviews = c2.reviews.map((r) => ({ ...r, rating: r.rating + 3 }));
  mockFinalize(c2);
  p.cycles = [c1, c2];
  loopPapers.push(p);
})();

const pdfBlobsByPaper = new Map<string, Record<number, Blob>>();

let hydration: Promise<void> | null = null;
function ensureHydrated(): Promise<void> {
  if (!hydration) {
    hydration = (async () => {
      const stored = await loadStoredPapers();
      let maxSeq = 0;
      for (const { paper, pdfBlobs } of stored) {
        if (paper.id === "lp_demo") continue;
        if (!Array.isArray((paper as LoopPaper).cycles)) continue; // v1-shape records
        if (loopPapers.some((x) => x.id === paper.id)) continue;
        for (const c of paper.cycles) {
          if (c.manuscript.kind === "pdf") {
            const blob = pdfBlobs?.[c.cycle];
            if (blob) c.manuscript.url = URL.createObjectURL(blob);
          }
        }
        pdfBlobsByPaper.set(paper.id, pdfBlobs ?? {});
        loopPapers.push(paper);
        const n = Number(paper.id.replace("lp_", ""));
        if (Number.isFinite(n)) maxSeq = Math.max(maxSeq, n);
      }
      seq = Math.max(seq, maxSeq + 1);
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

const jsonPost = (path: string, body?: unknown) =>
  http<LoopPaper>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

async function mockPaper(id: string): Promise<LoopPaper> {
  await ensureHydrated();
  const p = loopPapers.find((x) => x.id === id);
  if (!p) throw new Error(`paper ${id} not found`);
  return p;
}

/** Mock agent jobs: stage narration events, then run the mock op — so the
 *  no-backend mode streams the same way the live pipeline does. */
const mockJobs = new Map<string, AgentJob>();
let jobSeq = 1;
function runMockJob(op: AgentOp, staged: string[], fn: () => Promise<LoopPaper>): { jobId: string } {
  const job: AgentJob = { id: `mjob_${jobSeq++}`, op, status: "running", events: [], paperId: null };
  mockJobs.set(job.id, job);
  void (async () => {
    try {
      for (const text of staged) {
        job.events.push({ t: now(), kind: "step", text });
        await delay(450);
      }
      const p = await fn();
      job.paperId = p.id;
      job.status = "done";
    } catch (e) {
      job.status = "error";
      job.error = String(e);
    }
  })();
  return { jobId: job.id };
}

const REVIEW_STAGES = [
  "Submission received — assigning three reviewers…",
  "Reviewer 1 is reading the manuscript (novelty focus)…",
  "Reviewer 2 is reading the manuscript (experimental rigor focus)…",
  "Reviewer 3 is reading the manuscript (clarity focus)…",
  "All three reviews are in — the discussion phase is open.",
];

const current = (p: LoopPaper) => p.cycles[p.cycles.length - 1];

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
    const p = await mockPaper(id);
    await delay(120);
    return structuredClone(p);
  },

  /** Submit → cycle 1 reviews come back. No score until the meta-review. */
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
    await delay(1200);
    const id = `lp_${seq++}`;
    const p: LoopPaper = {
      id,
      title: input.title,
      abstract: (input.text ?? "").trim().slice(0, 280),
      status: "in_discussion",
      currentCycle: 1,
      cycles: [buildCycle(id, 1, manuscriptForSubmission(input))],
      createdAt: now(),
    };
    if (input.file) pdfBlobsByPaper.set(id, { 1: input.file });
    loopPapers.unshift(p);
    persist(p);
    return structuredClone(p);
  },

  /** Author rebuttal message; the addressed reviewer(s) respond. */
  async reply(id: string, input: { text: string; replyTo?: string }): Promise<LoopPaper> {
    if (BASE) return jsonPost(`/api/loop/papers/${id}/reply`, input);
    const p = await mockPaper(id);
    if (p.status === "decided") throw new Error("cycle already decided — resubmit to continue");
    await delay(900);
    const cyc = current(p);
    const authorMsg = pushMsg(cyc, "author", "Author", input.text, input.replyTo);
    if (cyc.draftManuscript) authorMsg.attachment = "revised-draft";
    const target = cyc.comments.find((c) => c.id === input.replyTo);
    const responders = target
      ? cyc.reviews.filter((r) => r.reviewer === target.reviewer)
      : cyc.reviews.slice(0, 2);
    for (const r of responders) {
      pushMsg(
        cyc,
        "reviewer",
        r.reviewer,
        `Thank you for the response. The clarification on ${target?.section ?? "the raised points"} addresses part of my concern; I still encourage the revision to make this explicit in the manuscript itself, and I will weigh the discussion in my final justification.`,
        authorMsg.id,
      );
    }
    persist(p);
    return structuredClone(p);
  },

  /** AI drafts revision hunks tied to review comments. */
  async revisionDraft(id: string): Promise<LoopPaper> {
    if (BASE) return jsonPost(`/api/loop/papers/${id}/revision-draft`);
    const p = await mockPaper(id);
    if (p.status === "decided") throw new Error("cycle already decided — resubmit to continue");
    await delay(1200);
    const cyc = current(p);
    cyc.pendingRevision = { hunks: mockHunks(cyc), createdAt: now() };
    persist(p);
    return structuredClone(p);
  },

  /** Apply per-hunk decisions; the allow/deny log auto-posts as rebuttal text. */
  async revisionApply(id: string, decisions: Record<string, boolean>): Promise<LoopPaper> {
    if (BASE) return jsonPost(`/api/loop/papers/${id}/revision-apply`, { decisions });
    const p = await mockPaper(id);
    const cyc = current(p);
    if (!cyc.pendingRevision) throw new Error("no pending revision draft");
    await delay(500);
    let text = cyc.manuscript.text ?? "";
    const applied: RevisionHunk[] = [];
    const declined: RevisionHunk[] = [];
    for (const h of cyc.pendingRevision.hunks) {
      h.decision = decisions[h.id] ? "allowed" : "denied";
      if (h.decision === "allowed" && text.includes(h.before)) {
        text = text.replace(h.before, h.after);
        applied.push(h);
      } else {
        declined.push(h);
      }
    }
    cyc.draftManuscript = text;
    const parts: string[] = [];
    if (applied.length) parts.push(`We revised the manuscript as follows: ${applied.map((h, i) => `(${i + 1}) ${h.rationale}`).join(" ")}`);
    if (declined.length) parts.push(`We considered but did not adopt: ${declined.map((h, i) => `(${i + 1}) ${h.rationale}`).join(" ")}`);
    // Pre-fills the composer instead of posting a ghost message.
    cyc.revisionNote = parts.join(" ") || "We reviewed the proposed revision and made no changes.";
    persist(p);
    return structuredClone(p);
  },

  /** End the cycle: AC meta-review + score + decision (like the real venue). */
  async finalize(id: string): Promise<LoopPaper> {
    if (BASE) return jsonPost(`/api/loop/papers/${id}/finalize`);
    const p = await mockPaper(id);
    if (p.status === "decided") return structuredClone(p);
    await delay(1500);
    mockFinalize(current(p));
    p.status = "decided";
    persist(p);
    return structuredClone(p);
  },

  /** Start the next cycle FRESH on the revised manuscript. */
  async resubmit(id: string): Promise<LoopPaper> {
    if (BASE) return jsonPost(`/api/loop/papers/${id}/resubmit`);
    const p = await mockPaper(id);
    if (p.status !== "decided") throw new Error("finalize the current cycle before resubmitting");
    await delay(1200);
    const prev = current(p);
    const manuscript: LoopManuscript = { ...prev.manuscript, text: prev.draftManuscript ?? prev.manuscript.text };
    p.cycles.push(buildCycle(p.id, prev.cycle + 1, manuscript));
    p.currentCycle = prev.cycle + 1;
    p.status = "in_discussion";
    const blobs = pdfBlobsByPaper.get(p.id);
    if (blobs?.[prev.cycle]) blobs[prev.cycle + 1] = blobs[prev.cycle];
    persist(p);
    return structuredClone(p);
  },

  /** Kick off a long agent op as a job; poll `job()` for streamed progress. */
  async startSubmit(input: SubmitLoopPaperInput): Promise<{ jobId: string }> {
    if (BASE) {
      const form = new FormData();
      form.set("title", input.title);
      if (input.file) form.set("file", input.file);
      if (input.text) form.set("text", input.text);
      return http("/api/loop/papers?mode=async", { method: "POST", body: form });
    }
    return runMockJob("submit", REVIEW_STAGES, () => loopApi.submit(input));
  },

  async startOp(
    id: string,
    op: Exclude<AgentOp, "submit">,
    payload?: { text?: string; replyTo?: string },
  ): Promise<{ jobId: string }> {
    if (BASE) return http(`/api/loop/papers/${id}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op, payload: payload ?? {} }),
    });
    const staged: Record<string, string[]> = {
      reply: ["Delivering your message to the reviewers…", "Reviewers are reading your rebuttal…"],
      "revision-draft": [
        "Revision agent is studying the open comments and the discussion…",
        "Drafting grounded changes (no fabricated results)…",
        "Anchoring each change to the manuscript…",
      ],
      finalize: [
        "Area Chair is synthesizing the reviews and the discussion…",
        "Meta-review drafted — calibrating the selection score…",
        "Explanation head is extracting feature attributions…",
      ],
      resubmit: REVIEW_STAGES,
    };
    return runMockJob(op, staged[op], () => {
      if (op === "reply") return loopApi.reply(id, { text: payload?.text ?? "", replyTo: payload?.replyTo });
      if (op === "revision-draft") return loopApi.revisionDraft(id);
      if (op === "finalize") return loopApi.finalize(id);
      return loopApi.resubmit(id);
    });
  },

  async job(jobId: string): Promise<AgentJob> {
    if (BASE) return http(`/api/loop/jobs/${jobId}`);
    const j = mockJobs.get(jobId);
    if (!j) throw new Error(`job ${jobId} not found`);
    return { ...j, events: [...j.events] };
  },

  /** The author edits the manuscript directly — the draft rides as a chip
   *  until the next message delivers it to the reviewers. */
  async editManuscript(id: string, text: string, note?: string): Promise<LoopPaper> {
    if (BASE) return jsonPost(`/api/loop/papers/${id}/manuscript`, { text, note });
    const p = await mockPaper(id);
    if (p.status === "decided") throw new Error("cycle already decided — resubmit to continue");
    current(p).draftManuscript = text;
    persist(p);
    return structuredClone(p);
  },

  /** Discard the pending revised draft (the chip's ✕). */
  async discardDraft(id: string): Promise<LoopPaper> {
    if (BASE) return http(`/api/loop/papers/${id}/draft`, { method: "DELETE" });
    const p = await mockPaper(id);
    const cyc = current(p);
    delete cyc.draftManuscript;
    delete cyc.revisionNote;
    persist(p);
    return structuredClone(p);
  },

  /** Permanently delete a submission and all its cycles. */
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
    for (const c of removed.cycles) {
      if (c.manuscript.kind === "pdf" && c.manuscript.url) URL.revokeObjectURL(c.manuscript.url);
    }
    pdfBlobsByPaper.delete(id);
    if (id === "lp_demo") hideDemoSeed();
    else await deleteStoredPaper(id);
  },
};
