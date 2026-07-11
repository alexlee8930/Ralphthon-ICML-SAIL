/**
 * Ralph review-agent API contract.
 * Mirrors the S1–S6 pipeline: review generation → discussion → meta-review
 * synthesis → score/selection → decision → deficiency explanation.
 * The backend will be served as an HTTP API; these types are the single
 * source of truth for the frontend.
 */

export type PaperStatus = "uploaded" | "reviewing" | "in_discussion" | "meta_reviewed" | "decided";

export interface Paper {
  id: string;
  title: string;
  abstract: string;
  status: PaperStatus;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaperVersion {
  version: number;
  fileName: string;
  uploadedAt: string;
  note?: string;
}

/** One entry in the review conversation thread. */
export type ThreadBlockType =
  | "user_message"
  | "agent_review"      // S1: generated review (strengths/weaknesses/questions)
  | "agent_reply"       // S2: discussion turn
  | "meta_review"       // S3: synthesized meta-review
  | "score_report"      // S4/S5: score + decision
  | "explanation"       // S6: deficiency explanation
  | "system";

export interface ThreadBlock {
  id: string;
  paperId: string;
  version: number;
  type: ThreadBlockType;
  author: "author" | "ralph" | "system";
  createdAt: string;
  /** Markdown body. */
  content: string;
  /** Structured payload for score_report blocks. */
  score?: ScoreReport;
}

export interface ScoreReport {
  /** Continuous selection score in [0,1] (selectivity head). */
  selectivity: number;
  /** Predicted grade tier. */
  gradeTier: "reject" | "poster" | "spotlight" | "oral" | "notable-top-5%";
  decision: "accept" | "reject";
  /** Probability-like award proximity signal. */
  awardProximity: number;
  /** Feature attributions driving the score (S6 input). */
  attributions: Array<{ feature: string; weight: number }>;
}

export interface Session {
  id: string;
  paperId: string;
  title: string;
  createdAt: string;
  lastActiveAt: string;
  blockCount: number;
}

export interface UploadPaperInput {
  title: string;
  abstract?: string;
  file?: File;
  text?: string;
}

export interface SendMessageInput {
  paperId: string;
  content: string;
  /** Attach a revised paper alongside the message (creates a new version). */
  revision?: File;
}
