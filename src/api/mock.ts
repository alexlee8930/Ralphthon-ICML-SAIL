/**
 * In-memory mock adapter so the UI runs standalone before the real
 * Ralph agent API exists. Deterministic demo data; async with small
 * latencies to exercise loading states.
 */
import type {
  Paper,
  PaperVersion,
  ScoreReport,
  SendMessageInput,
  Session,
  ThreadBlock,
  UploadPaperInput,
} from "./types";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
let idCounter = 100;
const nid = (p: string) => `${p}_${idCounter++}`;

const now = () => new Date().toISOString();

const papers: Paper[] = [
  {
    id: "p_demo1",
    title: "Uncertainty-Aware Curriculum for Long-Horizon Agent Training",
    abstract:
      "We study curriculum construction for long-horizon agentic tasks and propose an uncertainty-aware scheduler that prioritizes transitions with high epistemic value. Across three benchmark suites the scheduler improves sample efficiency by 1.8x while matching final task success.",
    status: "in_discussion",
    currentVersion: 2,
    createdAt: "2026-07-08T09:12:00Z",
    updatedAt: "2026-07-10T02:41:00Z",
  },
  {
    id: "p_demo2",
    title: "Sparse Retrieval Heads Emerge in Instruction-Tuned Transformers",
    abstract:
      "We identify a small set of attention heads that implement retrieval-like lookups after instruction tuning, and show that pruning all but these heads preserves 94% of long-context QA accuracy.",
    status: "uploaded",
    currentVersion: 1,
    createdAt: "2026-07-10T01:05:00Z",
    updatedAt: "2026-07-10T01:05:00Z",
  },
];

const versions: Record<string, PaperVersion[]> = {
  p_demo1: [
    { version: 1, fileName: "curriculum_v1.pdf", uploadedAt: "2026-07-08T09:12:00Z" },
    {
      version: 2,
      fileName: "curriculum_v2.pdf",
      uploadedAt: "2026-07-09T14:30:00Z",
      note: "Addressed reviewer questions on ablation coverage.",
    },
  ],
  p_demo2: [{ version: 1, fileName: "retrieval_heads.pdf", uploadedAt: "2026-07-10T01:05:00Z" }],
};

const REVIEW_MD = `**Summary.** The paper proposes an uncertainty-aware curriculum scheduler for long-horizon agent training and reports 1.8x sample-efficiency gains on three suites.

**Strengths**
1. The epistemic-value criterion is well motivated and simply stated (Eq. 4).
2. Consistent gains across all three suites; variance bands are reported.
3. The method adds negligible compute overhead (<2%).

**Weaknesses**
1. Ablations do not isolate the scheduler from the replay-buffer change introduced in §4.2.
2. Baselines omit the strongest recent curriculum method (PLR-v2).
3. Theoretical claim in Prop. 2 assumes stationary dynamics, which the tasks violate.

**Questions**
1. How sensitive are results to the uncertainty estimator's calibration?
2. Does the 1.8x gain hold when the backbone is scaled 4x?`;

const META_REVIEW_MD = `**Meta-review.** The submission tackles a relevant problem and the empirical gains are consistent and honestly reported. The central concern across the discussion was attribution: the reported speedup conflates the scheduler with a replay-buffer modification. The revision's new ablation (v2, Table 6) resolves this for two of the three suites. Remaining reservations concern the missing PLR-v2 baseline and the stationarity assumption in Prop. 2, which the authors now scope explicitly.

**Recommendation.** Accept (poster). The contribution is solid and clearly presented; the theoretical framing should be softened in the camera-ready.`;

const threads: Record<string, ThreadBlock[]> = {
  p_demo1: [
    {
      id: "b1",
      paperId: "p_demo1",
      version: 1,
      type: "system",
      author: "system",
      createdAt: "2026-07-08T09:12:05Z",
      content: "Paper uploaded (v1). Ralph is generating the initial review.",
    },
    {
      id: "b2",
      paperId: "p_demo1",
      version: 1,
      type: "agent_review",
      author: "ralph",
      createdAt: "2026-07-08T09:14:00Z",
      content: REVIEW_MD,
    },
    {
      id: "b3",
      paperId: "p_demo1",
      version: 1,
      type: "user_message",
      author: "author",
      createdAt: "2026-07-09T14:28:00Z",
      content:
        "Thanks — we added an ablation isolating the scheduler (new Table 6) and uploaded v2. On Q1: results are stable for ECE ≤ 0.08; we added Fig. 9.",
    },
    {
      id: "b4",
      paperId: "p_demo1",
      version: 2,
      type: "agent_reply",
      author: "ralph",
      createdAt: "2026-07-09T14:31:00Z",
      content:
        "The new Table 6 addresses the attribution concern on Suite-A and Suite-B; Suite-C still mixes both changes. The calibration sweep in Fig. 9 is convincing. Remaining open item: the PLR-v2 baseline comparison.",
    },
  ],
  p_demo2: [
    {
      id: "b10",
      paperId: "p_demo2",
      version: 1,
      type: "system",
      author: "system",
      createdAt: "2026-07-10T01:05:10Z",
      content: "Paper uploaded (v1). Request a review to start the S1 pass.",
    },
  ],
};

const scores: Record<string, ScoreReport> = {
  p_demo1: {
    selectivity: 0.63,
    gradeTier: "poster",
    decision: "accept",
    awardProximity: 0.12,
    attributions: [
      { feature: "empirical breadth", weight: 0.34 },
      { feature: "ablation completeness", weight: 0.27 },
      { feature: "novelty of criterion", weight: 0.21 },
      { feature: "theory rigor", weight: -0.18 },
    ],
  },
  p_demo2: {
    selectivity: 0.41,
    gradeTier: "poster",
    decision: "accept",
    awardProximity: 0.05,
    attributions: [
      { feature: "mechanistic clarity", weight: 0.31 },
      { feature: "evaluation scope", weight: -0.22 },
    ],
  },
};

export const mockAdapter = {
  async listPapers(): Promise<Paper[]> {
    await delay(180);
    return [...papers];
  },
  async getPaper(id: string): Promise<Paper> {
    await delay(120);
    const p = papers.find((x) => x.id === id);
    if (!p) throw new Error(`mock: paper ${id} not found`);
    return { ...p };
  },
  async listVersions(id: string): Promise<PaperVersion[]> {
    await delay(120);
    return [...(versions[id] ?? [])];
  },
  async uploadPaper(input: UploadPaperInput): Promise<Paper> {
    await delay(400);
    const paper: Paper = {
      id: nid("p"),
      title: input.title,
      abstract: input.abstract ?? "",
      status: "uploaded",
      currentVersion: 1,
      createdAt: now(),
      updatedAt: now(),
    };
    papers.unshift(paper);
    versions[paper.id] = [
      { version: 1, fileName: input.file?.name ?? "paper.pdf", uploadedAt: now() },
    ];
    threads[paper.id] = [
      {
        id: nid("b"),
        paperId: paper.id,
        version: 1,
        type: "system",
        author: "system",
        createdAt: now(),
        content: "Paper uploaded (v1). Request a review to start the S1 pass.",
      },
    ];
    return paper;
  },
  async getThread(paperId: string): Promise<ThreadBlock[]> {
    await delay(150);
    return [...(threads[paperId] ?? [])];
  },
  async sendMessage(input: SendMessageInput): Promise<ThreadBlock[]> {
    await delay(300);
    const t = threads[input.paperId] ?? (threads[input.paperId] = []);
    const paper = papers.find((p) => p.id === input.paperId);
    let version = paper?.currentVersion ?? 1;
    if (input.revision && paper) {
      version = ++paper.currentVersion;
      (versions[paper.id] ??= []).push({
        version,
        fileName: input.revision.name,
        uploadedAt: now(),
      });
    }
    const userBlock: ThreadBlock = {
      id: nid("b"),
      paperId: input.paperId,
      version,
      type: "user_message",
      author: "author",
      createdAt: now(),
      content: input.content,
    };
    const reply: ThreadBlock = {
      id: nid("b"),
      paperId: input.paperId,
      version,
      type: "agent_reply",
      author: "ralph",
      createdAt: now(),
      content:
        "Noted. I re-read the affected sections; the revision narrows the main concern. One follow-up: report the calibration sweep for the scaled backbone as well, then I can finalize the meta-review.",
    };
    t.push(userBlock, reply);
    if (paper) paper.status = "in_discussion";
    return [userBlock, reply];
  },
  async requestReview(paperId: string): Promise<ThreadBlock> {
    await delay(700);
    const block: ThreadBlock = {
      id: nid("b"),
      paperId,
      version: papers.find((p) => p.id === paperId)?.currentVersion ?? 1,
      type: "agent_review",
      author: "ralph",
      createdAt: now(),
      content: REVIEW_MD,
    };
    (threads[paperId] ??= []).push(block);
    const paper = papers.find((p) => p.id === paperId);
    if (paper) paper.status = "reviewing";
    return block;
  },
  async requestMetaReview(paperId: string): Promise<ThreadBlock> {
    await delay(900);
    const block: ThreadBlock = {
      id: nid("b"),
      paperId,
      version: papers.find((p) => p.id === paperId)?.currentVersion ?? 1,
      type: "meta_review",
      author: "ralph",
      createdAt: now(),
      content: META_REVIEW_MD,
      score: scores[paperId],
    };
    (threads[paperId] ??= []).push(block);
    const paper = papers.find((p) => p.id === paperId);
    if (paper) paper.status = "meta_reviewed";
    return block;
  },
  async getScore(paperId: string): Promise<ScoreReport> {
    await delay(200);
    return scores[paperId] ?? scores.p_demo2;
  },
  async listSessions(): Promise<Session[]> {
    await delay(150);
    return papers.map((p) => ({
      id: `s_${p.id}`,
      paperId: p.id,
      title: p.title,
      createdAt: p.createdAt,
      lastActiveAt: p.updatedAt,
      blockCount: (threads[p.id] ?? []).length,
    }));
  },
};
