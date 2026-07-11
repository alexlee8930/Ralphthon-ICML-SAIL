/**
 * Demo project / session / artifact data for the workbench UI, plus the domain
 * types the shell (and other areas) render against.
 *
 * Ported from the reference desktop app's `@ai4s/shared` + `lib/mock` — the
 * `@ai4s/*` packages don't exist on the web, so the types they exported are
 * inlined here and re-exported. Deterministic SVG figures are encoded as data
 * URIs so nothing hits the network.
 */

// ---- Runtime / model status -------------------------------------------------

export type RuntimeStatus = "connecting" | "ready" | "error" | "offline";
export type ModelStatus = "connected" | "disconnected" | "error";

// ---- Project / session ------------------------------------------------------

export interface Project {
  id: string;
  name: string;
  sessions: Session[];
}

export type SessionGroup = "Examples" | "Today" | "Active" | "Earlier";

export interface Session {
  id: string;
  projectId: string;
  title: string;
  group: SessionGroup;
  /** Optional right-aligned count badge, e.g. running agents. */
  badge?: number;
  /** Status dot color hint. */
  status?: "idle" | "running" | "done" | "warn";
  blocks: ThreadBlock[];
  inspector?: Inspector;
}

// ---- Thread blocks (center pane) --------------------------------------------

export type ThreadBlock =
  | UserMessageBlock
  | AgentMessageBlock
  | StepSummaryBlock
  | ToolCallBlock
  | ReviewerBlock
  | DataTableBlock
  | FigureBlock
  | ArtifactBlock
  | RunningJobsBlock
  | StatusLineBlock;

export interface UserMessageBlock {
  kind: "user";
  text: string;
}

export interface AgentMessageBlock {
  kind: "agent";
  /** Markdown; inline `code` tokens are rendered as blue mono. */
  markdown: string;
}

export interface StepSummaryBlock {
  kind: "step-summary";
  summary: string;
  steps: number;
  details?: string[];
}

export type ToolCallStatus =
  | "pending"
  | "running"
  | "waiting-approval"
  | "success"
  | "warning"
  | "failed";

export type ToolVerb = "Ran" | "Created" | "Edited" | "Read" | "Searched" | "Listed" | "Fetched";

export interface ToolCallBlock {
  kind: "tool-call";
  title: string;
  status: ToolCallStatus;
  /** Right-aligned meta, e.g. "142 lines of output" or "16m 2s". */
  meta?: string;
  verb?: ToolVerb;
  tool?: string;
  command?: string;
  filePath?: string;
  content?: string;
  diff?: string;
  partialOutput?: string;
  output?: string;
  startedAt?: number;
  endedAt?: number;
  outputSummary?: string;
  childSessionId?: string;
}

export type FindingLevel = "warn" | "ok" | "error";

export type ReviewCheck = "citation" | "number" | "figure" | "domain" | "integrity";

export interface ReviewFinding {
  level: FindingLevel;
  title: string;
  /** Monospace evidence body. */
  evidence?: string;
  check?: ReviewCheck;
  tag?: string;
}

export interface ReviewerBlock {
  kind: "reviewer";
  findings: ReviewFinding[];
  note?: string;
}

export interface DataTableBlock {
  kind: "table";
  columns: string[];
  rows: string[][];
  caption?: string;
}

export interface FigureBlock {
  kind: "figure";
  title: string;
  /** Image URL / data URI. */
  src: string;
  caption?: string;
  annotations?: FigureAnnotation[];
}

export interface FigureAnnotation {
  index: number;
  note: string;
  /** Percent position of the pin within the image. */
  x: number;
  y: number;
}

export type ArtifactKind =
  | "figure"
  | "script"
  | "report"
  | "table"
  | "notebook"
  | "model"
  | "data";

export interface ArtifactBlock {
  kind: "artifact";
  path: string;
  filename: string;
  artifact: ArtifactKind;
  tool: string;
  content?: string;
  language?: string;
}

export interface RunningJob {
  label: string;
  elapsed: string;
}

export interface RunningJobsBlock {
  kind: "running-jobs";
  title: string; // e.g. "REMOTE · 8"
  jobs: RunningJob[];
}

export interface StatusLineBlock {
  kind: "status-line";
  text: string; // e.g. "8 running · 16m 2s"
  tone?: "running" | "done" | "review" | "error";
  divider?: boolean;
}

// ---- Inspector (right pane) -------------------------------------------------

export type Inspector =
  | ArtifactInspector
  | NotebookInspector
  | PdfInspector
  | FilePreviewInspector
  | NotebookFileInspector;

export type FileRoot = "workspace" | "base";

export interface NotebookFileInspector {
  variant: "notebook-file";
  path: string;
  root?: FileRoot;
}

export interface FilePreviewInspector {
  variant: "file";
  path: string;
  filename: string;
  artifact: ArtifactKind;
  language?: string;
  content?: string;
  root?: FileRoot;
}

export interface ArtifactVersion {
  label: string; // "v1", "v2"
  code?: string;
  executionLog?: string;
  messages?: string[];
  environment?: string;
  reviewPassed?: boolean;
}

export type ArtifactTab = "Code" | "Execution Log" | "Messages" | "Environment" | "Review";

export type ArtifactType = "figure" | "report" | "table" | "script" | "notebook" | "pdf";

export interface ArtifactInspector {
  variant: "artifact";
  title: string;
  filename?: string;
  versions: ArtifactVersion[];
  activeVersion: string;
  reviewPassed?: boolean;
  inputs: string[];
  code: string;
  language: string;
  codeStartLine?: number;
  executionLog?: string;
  environment?: string;
  messages?: string[];
}

export interface NotebookCell {
  index: number;
  language: string;
  code: string;
  output?: string;
  image?: string;
}

export interface NotebookInspector {
  variant: "notebook";
  name: string;
  live: boolean;
  kernelLabel: string;
  kernelNote: string;
  cells: NotebookCell[];
}

export interface PdfInspector {
  variant: "pdf";
  title: string; // "review.pdf"
  doc: PdfDoc;
}

export interface PdfDoc {
  title: string;
  subtitle?: string;
  summaryTable?: DataTableBlock;
  figure?: FigureBlock;
  sections: PdfSection[];
}

export interface PdfSection {
  heading: string;
  body: string;
}

// ---- Deterministic figures (SVG data URIs) ----------------------------------
// Seeded PRNG so figures are stable across renders and builds; no network.

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

interface Cluster {
  cx: number;
  cy: number;
  color: string;
  spread: number;
  n: number;
}

function scatter(width: number, height: number, clusters: Cluster[], seed: number): string {
  const rng = makeRng(seed);
  const dots: string[] = [];
  for (const c of clusters) {
    for (let i = 0; i < c.n; i++) {
      const angle = rng() * Math.PI * 2;
      const radius = rng() * c.spread;
      const x = (c.cx + Math.cos(angle) * radius).toFixed(1);
      const y = (c.cy + Math.sin(angle) * radius).toFixed(1);
      const r = (1.2 + rng() * 1.3).toFixed(1);
      dots.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${c.color}" opacity="0.72"/>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#ffffff"/>${dots.join(
    "",
  )}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const HERO = {
  neuron: "#5b9bd5",
  muscle: "#bcbd22",
  immune: "#2ca02c",
  ciliated: "#17becf",
  germline: "#e377c2",
  progenitor: "#ff7f0e",
};

export const umapAtlas = scatter(
  640,
  420,
  [
    { cx: 250, cy: 260, color: HERO.neuron, spread: 130, n: 420 },
    { cx: 470, cy: 300, color: HERO.muscle, spread: 70, n: 150 },
    { cx: 500, cy: 150, color: HERO.immune, spread: 55, n: 120 },
    { cx: 300, cy: 180, color: HERO.progenitor, spread: 45, n: 90 },
    { cx: 360, cy: 250, color: HERO.germline, spread: 40, n: 70 },
    { cx: 330, cy: 320, color: HERO.ciliated, spread: 40, n: 70 },
  ],
  7,
);

export const umapBySite = scatter(
  320,
  260,
  [
    { cx: 150, cy: 130, color: "#9aa0a6", spread: 100, n: 300 },
    { cx: 210, cy: 90, color: "#9aa0a6", spread: 40, n: 60 },
  ],
  11,
);

export const umapByType = scatter(
  320,
  260,
  [
    { cx: 120, cy: 150, color: "#4c78a8", spread: 55, n: 120 },
    { cx: 210, cy: 110, color: "#f58518", spread: 45, n: 90 },
    { cx: 180, cy: 190, color: "#54a24b", spread: 45, n: 90 },
    { cx: 100, cy: 90, color: "#e45756", spread: 35, n: 70 },
    { cx: 240, cy: 180, color: "#b279a2", spread: 35, n: 70 },
  ],
  13,
);

export const citationScatter = scatter(
  360,
  300,
  [
    { cx: 120, cy: 90, color: "#8c8c8c", spread: 60, n: 80 },
    { cx: 230, cy: 200, color: "#3b6ea5", spread: 40, n: 30 },
  ],
  17,
);

// ---- Session 1: figure canvas + artifact inspector --------------------------

const figureSession: Session = {
  id: "figure-canvas",
  projectId: "cross-species",
  title: "Cross-species atlas figure",
  group: "Examples",
  status: "done",
  blocks: [
    {
      kind: "agent",
      markdown:
        "Rendered `atlas_fig1a.png` from the shared 138-species embedding. Callouts and inset boxes are driven by `fig4_atlas_callouts.csv`.",
    },
    {
      kind: "figure",
      title: "atlas_fig1a.png",
      src: umapAtlas,
      caption: "138 species · 5,672 cell types · one shared embedding",
      annotations: [{ index: 1, note: "these labels are hard to see", x: 72, y: 64 }],
    },
  ],
  inspector: {
    variant: "artifact",
    title: "atlas_fig1a.png",
    filename: "make_atlas_fig.py",
    versions: [
      {
        label: "v1",
        reviewPassed: false,
        code: `apply_nature_style()
centroids = pd.read_csv("fig4_atlas_centroids_m138.csv")
callouts  = pd.read_csv("fig4_atlas_callouts.csv")

HERO = {"neuron": "#5b9bd5", "muscle": "#bcbd22", "immune": "#2ca02c"}
# v1: hero palette only — insets and Arial styling not added yet`,
        executionLog:
          "$ python make_atlas_fig.py\n[ok] loaded 5,672 centroids\n[ok] wrote atlas_fig1a.png (v1)  1.0 MB  1600x1050\nfinished in 7.1s",
      },
      { label: "v2", reviewPassed: true },
    ],
    activeVersion: "v2",
    reviewPassed: true,
    inputs: ["fig4_atlas_callouts.csv", "fig4_atlas_centroids_m138.csv"],
    language: "python",
    codeStartLine: 54,
    code: `apply_nature_style()
mpl.rcParams['savefig.bbox'] = None
mpl.rcParams['font.sans-serif'] = ['Arial']
mpl.rcParams['font.family'] = 'sans-serif'

centroids = pd.read_csv("fig4_atlas_centroids_m138.csv")
boxes_df  = pd.read_csv("fig4_atlas_inset_boxes.csv")
callouts  = pd.read_csv("fig4_atlas_callouts.csv")

HERO = {"neuron": "#5b9bd5", "muscle": "#bcbd22", "immune": "#2ca02c",
        "ciliated": "#17becf", "germline": "#e377c2", "progenitor": "#ff7f0e"}

INSET_NAMES = {'a': 'ciliated cells', 'b': 'striated muscle', 'c': 'immune'}

for _, row in boxes_df.iterrows():
    tag = row.tag; fam = row.family; x0, y0, w, h = row.x0, row.y0, row.w, row.h
    target = centroids[(centroids.umap_x >= x0) & (centroids.family == fam)]
    inset_info[tag] = dict(fam=fam, xlim=(x0, x0 + w), ylim=(y0, y0 + h))`,
    executionLog: "$ python make_atlas_fig.py\n[ok] loaded 5,672 centroids\n[ok] wrote atlas_fig1a.png (v2)  1.2 MB  1600x1050\nfinished in 8.4s",
    environment: "python 3.11 · matplotlib 3.9 · pandas 2.2 · numpy 2.0\nkernel: figure-pipeline (local)",
    messages: [
      "generate the cross-species atlas figure with the hero palette",
      "add ciliated / striated-muscle / immune insets",
    ],
  },
};

// ---- Session 2: hyperparameter screen + notebook inspector ------------------

const sweepRows: string[][] = [];
let arm = 1;
for (const d of [10, 20, 30, 50]) {
  for (const L of [1, 2]) {
    sweepRows.push([
      String(arm),
      String(d),
      String(L),
      `d=${d} L=${L} · scVI COVID-PBMC (${arm}/8)`,
    ]);
    arm++;
  }
}

const sweepSession: Session = {
  id: "scvi-sweep",
  projectId: "cross-species",
  title: "SCVI Hyperparameter Screen",
  group: "Examples",
  status: "running",
  badge: 8,
  blocks: [
    {
      kind: "agent",
      markdown:
        "Dispatching the 8-arm scVI sweep to `lab_cluster A100s` — `n_latent ∈ {10, 20, 30, 50}` × `n_layers ∈ {1, 2}`, 40k cells × 2,000 HVGs, `batch_key=\"sample_id\"`, 50 epochs, seed 0.",
    },
    {
      kind: "table",
      columns: ["arm", "n_latent", "n_layers", "label"],
      rows: sweepRows,
    },
    {
      kind: "figure",
      title: "covid_pbmc_overview.png",
      src: umapBySite,
      caption: "Stephenson 2021 COVID PBMC — 40k cells, 2,000 batch-aware HVGs, no integration",
    },
    {
      kind: "running-jobs",
      title: "REMOTE · 8",
      jobs: [
        { label: "lab_cluster · d=10 L=1 · scVI COVID", elapsed: "16m 2s" },
        { label: "lab_cluster · d=10 L=2 · scVI COVID", elapsed: "15m 42s" },
        { label: "lab_cluster · d=20 L=1 · scVI COVID", elapsed: "15m 19s" },
        { label: "lab_cluster · d=20 L=2 · scVI COVID", elapsed: "14m 58s" },
        { label: "lab_cluster · d=30 L=1 · scVI COVID", elapsed: "14m 36s" },
        { label: "lab_cluster · d=30 L=2 · scVI COVID", elapsed: "14m 16s" },
      ],
    },
    { kind: "status-line", text: "8 running · 16m 2s", tone: "running" },
  ],
  inspector: {
    variant: "notebook",
    name: "liver-pipeline",
    live: true,
    kernelLabel: "Python — liver-pipeline kernel",
    kernelNote:
      "Connected to the agent's live kernel — variables and state are shared. Type an expression and press Enter.",
    cells: [
      {
        index: 28,
        language: "python",
        code: `import pandas as pd
pd.set_option('mode.string_storage', 'python')
import numpy as np, scanpy as sc, anndata as ad, scipy.sparse as sp

a = sc.read_h5ad("covid_pbmc_40k_hvg.h5ad")
print("loaded:", a.shape, "uns keys:", list(a.uns.keys()))

# minimal, version-portable object: counts + obs + var only
keep_obs = ["sample_id", "donor_id", "Site", "initial_clustering",
            "author_cell_type", "disease", "Status",
            "Status_on_day_collection_summary", "cell_type"]
keep_obs = [c for c in keep_obs if c in a.obs.columns]
obs = a.obs[keep_obs].copy()
clean = ad.AnnData(X=sp.csr_matrix(a.layers["counts"]), obs=obs, var=var)
clean.write_h5ad("covid_pbmc_40k_hvg.h5ad")`,
        output: "wrote covid_pbmc_40k_hvg.h5ad",
      },
    ],
  },
};

// ---- Session 3: literature review + reviewer + PDF inspector ----------------

const litSession: Session = {
  id: "lit-review",
  projectId: "cross-species",
  title: "Cross-species scRNA-seq Integration",
  group: "Examples",
  status: "warn",
  blocks: [
    {
      kind: "user",
      text: "Write a literature review on cross-species single-cell RNA-seq integration. Pull the primary methods papers and recent benchmarks. Output the report as a LaTeX doc and a compiled PDF.",
    },
    {
      kind: "step-summary",
      summary: "Ran 4 searches, loaded 2 skills, managed environments, +2 more",
      steps: 10,
      details: [
        "literature-review skill loaded",
        "citation-reviewer skill loaded",
        "PubMed / bioRxiv / OpenAlex / CELLxGENE searches",
        "environment: latex-report (local)",
      ],
    },
    {
      kind: "agent",
      markdown:
        "Dispatching five parallel literature-retrieval tracks — PubMed primary methods, bioRxiv preprints, OpenAlex citation counts, CELLxGENE multi-species atlas inventory, and orthology-free embedding methods.",
    },
    {
      kind: "tool-call",
      title: "Dispatching PubMed bioRxiv OpenAlex CELLxGENE sub-agents",
      status: "success",
      meta: "142 lines of output",
    },
    {
      kind: "reviewer",
      note: "The agent reads these findings and self-corrects in its next message.",
      findings: [
        {
          level: "warn",
          title: "PMID 31178118 assigned to both LIGER and Seurat v3 integration in the plan",
          evidence:
            'In the generate_plan PubMed delegation step the agent writes "LIGER (31178118), Seurat v3 integration (31178118)" — the same PMID for two distinct primary methods papers. The OpenAlex step assigns them different DOIs (Seurat v3 10.1016/j.cell.2019.05.031, LIGER 10.1016/j.cell.2019.05.006), so the plan is internally inconsistent and at least one PMID is wrong. No msg tool_result rows trace to any in-window lookup.',
        },
      ],
    },
    {
      kind: "agent",
      markdown:
        "Acknowledged — the plan listed PMID 31178118 for both; the PubMed sub-agent caught the swap and the saved CSV carries the corrected pair (LIGER 31178122, Seurat v3 31178118).",
    },
    { kind: "status-line", text: "all 5 agents done · Reviewing", tone: "review" },
  ],
  inspector: {
    variant: "pdf",
    title: "review.pdf",
    doc: {
      title: "Cross-species single-cell RNA-seq integration",
      subtitle: "from one-to-one orthologs to protein-language-model embeddings",
      summaryTable: {
        kind: "table",
        columns: ["Papers", "Years", "Methods", "Species pairs", "Top-cited", "Most recent"],
        rows: [
          ["24", "2018–2025", "15", "6 benchmarked", "Seurat v3 (16,935 cit.)", "TranscriptFormer (2025)"],
        ],
      },
      figure: {
        kind: "figure",
        title: "Figure 1",
        src: citationScatter,
        caption:
          "Fifteen integration methods (2018–2024) coloured by orthology strategy; OpenAlex citation counts on log scale.",
      },
      sections: [
        {
          heading: "1  Problem statement",
          body: "Comparative single-cell transcriptomics asks whether a cell type in one species has a homolog in another, and how its expression program has been conserved or rewired. The technical obstacle is that any two species' transcriptomes live in different gene coordinate systems.",
        },
        {
          heading: "2  Ortholog-subsetting methods",
          body: "Seurat v3 finds canonical-correlation vectors over the shared-ortholog matrices, then anchors mutual nearest neighbours. LIGER factorises each dataset, sharing a common W across species and isolating species-specific signal. Harmony operates post-PCA, iteratively soft-clustering and shifting centroids to maximise batch diversity within clusters.",
        },
      ],
    },
  },
};

export const mockProject: Project = {
  id: "cross-species",
  name: "Cross-species scRNA-seq",
  sessions: [figureSession, sweepSession, litSession],
};

export const mockProjects: Project[] = [mockProject];

export function findSession(sessionId: string): Session | undefined {
  return mockProject.sessions.find((s) => s.id === sessionId);
}

export const defaultSessionId = litSession.id;
