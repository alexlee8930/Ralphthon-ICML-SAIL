import { useState } from "react";
import { Bot, Boxes, Check, Package, Puzzle, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/cn";

/**
 * Skills, agents, install-a-skill, and detected environment. The desktop app
 * loaded skills/agents live from the OpenCode runtime; on the web these are the
 * Ralph review pipeline's own stages (S1 review → S6 explanation) and the
 * agents that run them.
 */

interface ToolEntry {
  name: string;
  found: boolean;
  version?: string;
}

interface AgentEntry {
  name: string;
  description: string;
  mode: "primary" | "subagent";
}

interface SkillEntry {
  name: string;
  description: string;
  source: "builtin";
}

const TOOLS: ToolEntry[] = [
  { name: "reviewer", found: true, version: "llm · review-generation head" },
  { name: "scorer", found: true, version: "selectivity-head v2" },
  { name: "embeddings", found: true, version: "paper-encoder v3" },
  { name: "ocr", found: false },
];

const AGENTS: AgentEntry[] = [
  { name: "reviewer", description: "Reads the paper and drafts strengths, weaknesses, and questions (S1).", mode: "primary" },
  { name: "discussant", description: "Runs the reviewer↔author discussion rounds and resolves threads (S2).", mode: "subagent" },
  { name: "meta-reviewer", description: "Synthesizes the reviews and discussion into a single meta-review (S3).", mode: "subagent" },
  { name: "scorer", description: "Predicts the selectivity score, grade tier, and accept/reject decision (S4/S5).", mode: "subagent" },
  { name: "explainer", description: "Turns the score's feature attributions into a plain-language deficiency report (S6).", mode: "subagent" },
];

const SKILLS: SkillEntry[] = [
  { name: "s1-review", description: "Generate a structured review — summary, strengths, weaknesses, and questions — from the submitted paper.", source: "builtin" },
  { name: "s2-discussion", description: "Facilitate multi-round discussion between the reviewer and the author, tracking and resolving each thread.", source: "builtin" },
  { name: "s3-meta-review", description: "Synthesize all reviews and the discussion into one meta-review with an agreement estimate.", source: "builtin" },
  { name: "s4-scoring", description: "Score the paper with the selectivity head and produce the grade tier, decision, and award proximity.", source: "builtin" },
  { name: "s6-explanation", description: "Explain the score by attributing it to interpretable paper features for the author.", source: "builtin" },
];

export function SkillsPage() {
  const connected = true;
  const [text, setText] = useState("");
  const [installing, setInstalling] = useState(false);

  const onInstall = async () => {
    if (!text.trim()) return;
    setInstalling(true);
    await new Promise((r) => setTimeout(r, 600));
    setInstalling(false);
    setText("");
    toast.ok("Skill installation runs in the desktop app.");
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-8 py-8">
        <h1 className="font-serif text-xl text-text">Skills & Agents</h1>
        <p className="mt-1 text-sm text-muted">
          The Ralph review pipeline stages, plus anything under{" "}
          <span className="font-mono">ralph/pipeline/</span> in your workspace.
        </p>

        {/* Install a skill (#1) */}
        <Section title="Install a skill" icon={<Boxes size={15} />}>
          <div className="p-4">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste a skill (Markdown) or a GitHub URL — the agent installs it into ralph/pipeline/"
              rows={3}
              className="w-full resize-y rounded-input border border-border bg-surface px-3 py-2 text-sm text-text outline-none placeholder:text-muted"
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={onInstall}
                disabled={!connected || !text.trim() || installing}
                className="rounded-input bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-40"
              >
                {installing ? "Starting…" : "Install with agent"}
              </button>
              <span className="text-xs text-muted">
                Opens a session and asks the agent to add it.
              </span>
            </div>
          </div>
        </Section>

        {/* Environment (#2) */}
        <Section title="Review environment" icon={<Package size={15} />}>
          {TOOLS.length === 0 && <Empty>Environment detection runs in the desktop app.</Empty>}
          {TOOLS.map((tool) => (
            <div key={tool.name} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              {tool.found ? <Check size={15} className="text-ok" /> : <X size={15} className="text-muted" />}
              <span className="w-24 text-text">{tool.name}</span>
              <span className="flex-1 truncate font-mono text-xs text-muted">
                {tool.found ? tool.version ?? "found" : "not found"}
              </span>
            </div>
          ))}
          <p className="px-4 py-2 text-xs text-muted">
            The pipeline runs each stage with whatever is configured here. Scanned PDFs need OCR before S1 can read them.
          </p>
        </Section>

        <Section title={`Agents (${AGENTS.length})`} icon={<Bot size={15} />}>
          {AGENTS.length === 0 && <Empty>No agents reported.</Empty>}
          {AGENTS.map((a) => (
            <RowItem key={a.name} name={a.name} desc={a.description} tag={a.mode} />
          ))}
        </Section>
        <Section title={`Skills (${SKILLS.length})`} icon={<Puzzle size={15} />}>
          {SKILLS.length === 0 && <Empty>No skills loaded yet.</Empty>}
          {SKILLS.map((s) => (
            <RowItem key={s.name} name={s.name} desc={s.description} tag="built-in" />
          ))}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted">
        {icon} {title}
      </h2>
      <div className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
        {children}
      </div>
    </section>
  );
}

function RowItem({ name, desc, tag }: { name: string; desc: string; tag?: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Package size={16} className="mt-0.5 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-text">{name}</div>
        <div className={cn("text-xs text-muted", "line-clamp-2")}>{desc}</div>
      </div>
      {tag && (
        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted ring-1 ring-border">
          {tag}
        </span>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-6 text-center text-sm text-muted">{children}</div>;
}
