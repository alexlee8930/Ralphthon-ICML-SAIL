// Maps the Ralph API thread (@/api/types) onto the reference visual block
// vocabulary so the ported renderers stay byte-identical.
//   user_message                     → user bubble
//   agent_review/agent_reply/
//   meta_review/explanation          → assistant markdown block
//   score_report (or an attached
//   score on a meta_review)          → score-report metric card
//   system                           → quiet status line
import type { ThreadBlock as ApiThreadBlock } from "@/api/types";
import type { ThreadBlock } from "./blocks-thread";

export function toThreadBlocks(blocks: ApiThreadBlock[]): ThreadBlock[] {
  const out: ThreadBlock[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "user_message":
        out.push({ kind: "user", text: b.content });
        break;
      case "agent_review":
      case "agent_reply":
      case "meta_review":
      case "explanation":
        out.push({ kind: "agent", markdown: b.content });
        if (b.score) out.push({ kind: "score-report", score: b.score });
        break;
      case "score_report":
        if (b.content) out.push({ kind: "agent", markdown: b.content });
        if (b.score) out.push({ kind: "score-report", score: b.score });
        break;
      case "system":
        out.push({ kind: "status-line", text: b.content, tone: "review" });
        break;
    }
  }
  return out;
}
