"""ICML SAIL with Ralph — backend adapter (contract v2, cycle model).

Mirrors the real ICML process. One CYCLE = one submission to the venue:

    submit manuscript ──> 3 reviewer reviews (no score shown)
        └─> rebuttal thread: author messages (incl. per-comment replies),
            reviewer follow-ups, and hunk-level AI revision decisions
                └─> finalize: AC meta-review is written off the reviews +
                    the whole discussion — ONLY THEN a score + decision appear
                        └─> resubmit: next cycle starts FRESH (new reviews on
                            the revised manuscript; the old thread stays behind)

Endpoints:
    POST   /api/loop/papers                       submit (multipart: title, text?, file?) -> cycle 1 reviews
    GET    /api/loop/papers                       list
    GET    /api/loop/papers/{id}                  full state
    DELETE /api/loop/papers/{id}                  delete a submission
    POST   /api/loop/papers/{id}/reply            author rebuttal message {text, replyTo?} -> reviewer follow-ups
    POST   /api/loop/papers/{id}/revision-draft   AI drafts revision hunks (before/after/rationale per comment)
    POST   /api/loop/papers/{id}/revision-apply   {decisions:{hunkId:bool}} -> apply allowed hunks; the
                                                  allow/deny log auto-posts to the thread as rebuttal text
    POST   /api/loop/papers/{id}/finalize         AC meta-review + score + decision (ends the cycle)
    POST   /api/loop/papers/{id}/resubmit         new cycle from the revised manuscript, fresh context

Real pipeline (when ANTHROPIC_API_KEY is set):
    review head       -> 3 parallel Claude reviewer agents (few-shot ICML persona skills)
    reviewer replies  -> Claude reviewer-reply agent grounded in that reviewer's own review + thread
    meta-review+score -> VESSL Qwen3-8B LoRA (/meta-review) fed reviews + the rebuttal thread as
                         `discussion`; score = p_accept x100, calibrated (p^0.25) and anchored to
                         visible reviewer ratings
    explanation head  -> Claude feature attributions with verbatim evidence
    revision agent    -> Claude drafts grounded hunks (never fabricates results; placeholder
                         manuscripts get no invented content)
Each head degrades independently to a deterministic fallback (used wholesale without a key).

State persists to SAIL_STATE_PATH (default ./sail_state.json).
"""

from __future__ import annotations

import contextvars
import json
import os
import re
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

try:
    import fitz  # pymupdf
except ImportError:  # pragma: no cover
    fitz = None

SELECT_THRESHOLD = 88
STATE_PATH = os.environ.get("SAIL_STATE_PATH", "sail_state.json")

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
VESSL_META_URL = os.environ.get(
    "VESSL_META_URL", "https://api-wsp-2udsccqmif6o.betelgeuse.cloud.vessl.ai"
)
VESSL_META_MODEL = os.environ.get("VESSL_META_MODEL", "v2")
# Trained /score head as the primary scorer. It is calibrated on real conference
# selectivity, so absolute scores read very low on demo papers — set to "0" to
# use the original path (p_accept^0.25 calibration + rating-anchor blend).
SAIL_SCORE_HEAD = os.environ.get("SAIL_SCORE_HEAD", "1") != "0"
CLAUDE_MODEL = os.environ.get("SAIL_CLAUDE_MODEL", "claude-opus-4-8")
LIVE = bool(ANTHROPIC_API_KEY)

app = FastAPI(title="sail-adapter", version="2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_lock = threading.Lock()
_state: dict[str, Any] = {"seq": 1, "papers": []}  # papers: newest first

# --------------------------------------------------------------------------
# Agent jobs — long operations run in a thread and stream progress events
# (harness step narration + Claude thinking summaries) that the UI polls,
# so the author watches the agents work instead of staring at a spinner.
# --------------------------------------------------------------------------

_jobs: dict[str, dict[str, Any]] = {}
_jobs_lock = threading.Lock()
_emitter: contextvars.ContextVar[Optional[Callable[[str, str], None]]] = contextvars.ContextVar(
    "sail_emitter", default=None
)


def emit(kind: str, text: str) -> None:
    """Report progress from anywhere inside the pipeline (no-op outside a job)."""
    fn = _emitter.get()
    if fn:
        fn(kind, text)


def _new_job(op: str) -> dict[str, Any]:
    job = {
        "id": f"job_{uuid.uuid4().hex[:10]}",
        "op": op,
        "status": "running",
        "events": [],
        "paperId": None,
        "error": None,
        "createdAt": _now(),
    }
    with _jobs_lock:
        _jobs[job["id"]] = job
        # Keep the registry bounded.
        if len(_jobs) > 200:
            for k in list(_jobs)[:-100]:
                del _jobs[k]
    return job


def _run_job(job: dict[str, Any], fn: Callable[[], dict[str, Any]]) -> None:
    def emitter(kind: str, text: str) -> None:
        job["events"].append({"t": _now(), "kind": kind, "text": text})

    def target() -> None:
        token = _emitter.set(emitter)
        try:
            paper = fn()
            job["paperId"] = paper["id"]
            job["status"] = "done"
        except HTTPException as e:
            job["status"] = "error"
            job["error"] = str(e.detail)
        except Exception as e:  # noqa: BLE001
            job["status"] = "error"
            job["error"] = str(e)
        finally:
            _emitter.reset(token)

    threading.Thread(target=target, daemon=True).start()


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _load_state() -> None:
    global _state
    try:
        with open(STATE_PATH, encoding="utf-8") as f:
            loaded = json.load(f)
        # v1 state (version model) is incompatible — start fresh.
        if loaded.get("papers") and "cycles" not in loaded["papers"][0]:
            return
        _state = loaded
    except (FileNotFoundError, json.JSONDecodeError):
        pass


def _save_state() -> None:
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(_state, f, ensure_ascii=False)
    os.replace(tmp, STATE_PATH)


_load_state()

# --------------------------------------------------------------------------
# Deterministic fallback content (also the no-key demo mode)
# --------------------------------------------------------------------------

FALLBACK_REVIEWS: list[tuple[str, int, str, list[tuple[str, str, str]]]] = [
    (
        "Reviewer 1", 4,
        "The core idea is genuinely interesting and the writing is clear, but the central claim is not isolated from the auxiliary loss — without a head-only ablation I cannot attribute the gains.",
        [
            ("major", "Method", "The central claim is not isolated: the gains could come from the auxiliary loss rather than the proposed head. Add an ablation that removes only the head."),
            ("question", "Method", "How does the approach behave when the score head is trained on a different venue distribution?"),
        ],
    ),
    (
        "Reviewer 2", 5,
        "Solid contribution with a plausible mechanism. My main reservation is experimental rigor: single-seed results and a missing strong baseline make the tables hard to trust.",
        [
            ("major", "Experiments", "All results use a single seed. Report mean ± std over ≥3 seeds for the main tables."),
            ("major", "Related work", "The comparison omits the strongest recent baseline; without it the improvement claim is not supported."),
        ],
    ),
    (
        "Reviewer 3", 4,
        "Several figures are illegible at print size and the contribution list overstates the theory result. The method may be sound, but presentation undermines the evidence.",
        [
            ("minor", "Figures", "Figure 2 axis labels are unreadable at print size; regenerate at higher resolution."),
            ("minor", "Writing", "Section 3 mixes notation (x vs x̃) — unify and add a notation table."),
        ],
    ),
]

FALLBACK_REPLY = (
    "Thank you for the response. The clarification on {topic} addresses part of my concern; "
    "I still encourage the revision to make this explicit in the manuscript itself, and I will "
    "weigh the discussion in my final justification."
)

CYCLE_SCORES = [63, 79, 91, 96]  # fallback score per cycle at finalize


def fallback_meta(cycle_no: int, thread_len: int, applied: int, declined: int) -> str:
    return (
        f"Meta-review (cycle {cycle_no}). The reviewers raised concerns about attribution, "
        f"experimental rigor, and presentation. Across {thread_len} discussion messages the "
        f"authors engaged substantively, applying {applied} revision(s) and declining {declined} "
        f"with stated reasons. "
        + (
            "The committee finds the remaining concerns narrow and recommends selection."
            if CYCLE_SCORES[min(cycle_no - 1, len(CYCLE_SCORES) - 1)] >= SELECT_THRESHOLD
            else "Substantive concerns remain; the committee recommends revise-and-resubmit."
        )
    )


def fallback_attributions(text: Optional[str], score: int) -> list[dict[str, Any]]:
    def ev(pattern: str) -> list[str]:
        if not text:
            return []
        sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if len(s.strip()) > 30]
        return [s for s in sents if re.search(pattern, s, re.I)][:2]

    pos_w = round(0.2 + score / 500, 2)
    return [
        {"feature": "novelty of contribution", "weight": pos_w, "evidence": ev(r"propose|novel|new|contribution")},
        {"feature": "clarity of writing", "weight": 0.18, "evidence": ev(r"abstract|section|we (study|present|show)")},
        {"feature": "empirical breadth", "weight": round((score - 70) / 100, 2), "evidence": ev(r"benchmark|dataset|experiment")},
        {"feature": "ablation completeness", "weight": round((score - 85) / 120, 2), "evidence": ev(r"ablation|isolat|seed")},
    ]


def layers_for_score(score: int) -> list[float]:
    base = 0.2 + 0.6 * (score / 100)
    out = []
    for i in range(12):
        wobble = ((i * 37 + score * 13) % 10) / 100
        bottleneck = 0.15 if i == 7 else 0.0
        out.append(min(1.0, round(base * (0.7 + 0.03 * i) + bottleneck + wobble, 2)))
    return out


def fallback_hunks(cyc: dict[str, Any]) -> list[dict[str, Any]]:
    text = cyc["manuscript"].get("text") or ""
    hunks = []
    sents = [s for s in re.split(r"(?<=[.!?])\s+", text) if len(s) > 25]
    open_comments = [c for c in cyc["comments"]]
    for i, s in enumerate(sents[:3]):
        cid = open_comments[i % len(open_comments)]["id"] if open_comments else ""
        hunks.append(
            {
                "id": f"h{i}",
                "before": s,
                "after": s.rstrip(".") + ", which we scope explicitly and support with a seed-reported ablation in the revision.",
                "rationale": "Scopes the claim and ties it to the reviewers' rigor concerns.",
                "commentIds": [cid] if cid else [],
            }
        )
    return hunks


def calibrate_p_accept(p: float) -> int:
    p = min(max(p, 1e-6), 1.0)
    return max(1, min(99, round(100 * (p ** 0.25))))


def tier_for(score: int) -> str:
    if score >= 95:
        return "notable-top-5%"
    if score >= 88:
        return "oral"
    if score >= 78:
        return "spotlight"
    if score >= 60:
        return "poster"
    return "reject"


# --------------------------------------------------------------------------
# Real pipeline — Claude agents + VESSL meta/score heads (claude-science-style
# harness: each head is an agent with a skill prompt and a strict schema)
# --------------------------------------------------------------------------

if LIVE:
    import anthropic
    import httpx

    _claude = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

FEWSHOT_REVIEW = """Example review (format to imitate):
Rating: 6 | Summary: Proposes cross-modal BEV distillation with dense feature and sparse instance
distillation; effective on nuScenes, writing is clear.
Issues:
- major | Method | Target-level distillation is not novel in the distillation domain, and it only
  contributes 0.6% mAP - the central contribution needs sharper positioning.
- minor | Experiments | Report variance across seeds for the main table."""

# The review head is a stand-in for the fine-tuned reviewer model training on
# VESSL (astage-reviewer-ft) — keep it neutral (focus-only, corpus-style
# output) so swapping in the served head later is a drop-in, not a downgrade.
REVIEWER_PERSONAS = [
    ("Reviewer 1", "novelty, positioning against prior work, and whether the central claim is actually supported by the evidence"),
    ("Reviewer 2", "experimental rigor: baselines, seeds, ablations, statistical soundness, and reproducibility"),
    ("Reviewer 3", "clarity and presentation: writing, figures, notation, and whether claims in the abstract/intro match the body"),
]

REVIEWER_SKILL = """You are an ICML reviewer writing a careful, concrete review for the area chair.
Your assigned focus: {focus}.
Judge the manuscript on its actual text - quote or reference specific sections. Be fair: name real
strengths, and raise only issues that are actionable. Rating is ICML-style 1-10 (5-6 borderline).
Rate 1 ONLY when the text is not research content at all (a greeting, placeholder, lorem ipsum,
or off-topic prose) - say so plainly and do not review it as a paper. A short but genuine research
abstract or extended abstract IS reviewable: treat it as an early-stage submission, grade it down
for what is missing (typically 2-4), and name concretely what a full manuscript must add.
Raise 2-3 issues, each with severity (major/minor/question), the manuscript section it concerns,
and a self-contained body a reviewer would actually write. Also fill the venue review form:
confidence 1-5 (ICLR scale), soundness/presentation/contribution each 1-4, and 1-3 short
strengths bullets (real strengths grounded in the text).

{fewshot}"""

# Venue-aware review bar. "icml" (default) keeps the main-conference bar above.
# "workshop" recalibrates for 2-4 page hackathon submissions: the format IS the
# complete expected artifact, so brevity itself is not a flaw — this aligns the
# agent's bar with how human judges grade event papers (not more generous:
# real flaws still cost points).
SAIL_VENUE = os.environ.get("SAIL_VENUE", "icml")
if SAIL_VENUE == "workshop":
    REVIEWER_SKILL = REVIEWER_SKILL.replace(
        """A short but genuine research
abstract or extended abstract IS reviewable: treat it as an early-stage submission, grade it down
for what is missing (typically 2-4), and name concretely what a full manuscript must add.""",
        """This submission is a 2-4 page workshop-style paper — that IS the complete expected
format, not an early draft. Do NOT grade it down for brevity or for lacking main-conference
completeness (exhaustive tables, many baselines, appendices). Judge what the format can show:
a crisp question, a sound method at this scope, evidence that supports the claims made, and
honest limitations. A strong 4-page paper merits 6-8. Grade down only for real flaws:
confounded comparisons, overclaiming beyond the evidence, or missing method detail that
would easily fit within 4 pages.""",
    )

REVIEW_SCHEMA = {
    "type": "object",
    "properties": {
        "rating": {"type": "integer"},
        "confidence": {"type": "integer"},
        "soundness": {"type": "integer"},
        "presentation": {"type": "integer"},
        "contribution": {"type": "integer"},
        "summary": {"type": "string"},
        "strengths": {"type": "array", "items": {"type": "string"}},
        "comments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "severity": {"type": "string", "enum": ["major", "minor", "question"]},
                    "section": {"type": "string"},
                    "body": {"type": "string"},
                },
                "required": ["severity", "section", "body"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["rating", "confidence", "soundness", "presentation", "contribution", "summary", "strengths", "comments"],
    "additionalProperties": False,
}

# The served feedback heads are trained on meta-reviews (median ~700 chars),
# so their judgments are right but thin next to a real review (median ~2,900
# chars). This expansion layer is the server's own job — it survives the head
# swap: the head owns the JUDGMENTS (rating, issues), the server writes them
# out to ICML review length, grounded in the manuscript. Bonus: the meta head
# was trained on full-length reviews as input, so expanded reviews also match
# its input distribution.
REVIEW_EXPAND_SKILL = """You are writing out an ICML review at full length from a reviewer's concise
judgment. You are given the manuscript and the reviewer's verdict: rating, one-line summary, and
the specific issues raised. Expand this into a complete ICML-style review body (350-550 words)
with exactly these sections:

[Summary Of The Paper] 3-6 sentences faithfully describing what the paper does.
[Strength And Weaknesses] Strengths first (real ones, grounded in the text), then weaknesses -
each weakness must elaborate one of the GIVEN issues with concrete reasoning: quote or reference
the manuscript passage it concerns, explain why it matters, and what evidence would resolve it.
[Questions] 1-3 questions consistent with the given issues.

Hard constraints: do NOT change, add, or soften any verdict - every given issue appears, no new
issues, and the overall tone must match the given rating. Ground every claim in the manuscript
text; never invent content the paper does not contain."""

REVIEW_EXPAND_SCHEMA = {
    "type": "object",
    "properties": {"body": {"type": "string"}},
    "required": ["body"],
    "additionalProperties": False,
}

REVIEWER_REPLY_SKILL = """You are {reviewer}, an ICML reviewer, in the author-reviewer discussion phase.
You wrote the review below. The author has just responded (possibly to one of your specific
comments). Write your follow-up the way real reviewers do: acknowledge what genuinely resolves a
concern, push back where the response is hand-waving, and say what would change your assessment.
2-5 sentences, professional, no pleasantries beyond one short opener. Do not invent new issues
unrelated to your review."""

REPLY_SCHEMA = {
    "type": "object",
    "properties": {"reply": {"type": "string"}},
    "required": ["reply"],
    "additionalProperties": False,
}

ATTRIBUTION_SKILL = """You are the explanation head of a paper-selection model. Given a manuscript and its
selection score (0-100, >=88 is award-similar), produce 4-7 feature attributions explaining what
drives the score. Weights are signed contributions summing to roughly +/-1. For each feature,
quote 1-2 EXACT sentences from the manuscript as evidence (verbatim substrings). Features are
short lowercase phrases like "ablation completeness", "novelty of contribution"."""

ATTRIBUTION_SCHEMA = {
    "type": "object",
    "properties": {
        "attributions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "feature": {"type": "string"},
                    "weight": {"type": "number"},
                    "evidence": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["feature", "weight", "evidence"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["attributions"],
    "additionalProperties": False,
}

REVISION_SKILL = """You are the author-side revision agent in a paper-review loop. Given the manuscript,
the reviewer comments, and the discussion so far, draft a set of REVISION HUNKS the author can
accept or decline individually.

Each hunk: `before` is an EXACT verbatim substring of the current manuscript (long enough to be
unique), `after` is its replacement, `rationale` says which concern it addresses and how,
`commentIds` lists the review comment ids it responds to.

Grounding rules (hard constraints):
- Never invent experiments, datasets, results, numbers, baselines, or contributions that are not
  already present in the manuscript. Fabricated empirical content is forbidden.
- You MAY restructure, clarify, scope claims correctly, strengthen positioning, and add
  limitations/discussion text grounded in what exists.
- When a comment asks for new experiments you cannot honestly provide, the hunk may add a clearly
  marked "Planned revisions" note - never results written as completed.
- Return ZERO hunks ONLY when the text is not research content at all (a greeting, placeholder,
  lorem ipsum, or off-topic prose). A short but genuine research abstract or extended abstract IS
  revisable substance - propose clarity, scoping, and positioning edits for it.
- FIGURES: when a reviewer asks for a figure/diagram (or one clearly helps), a hunk's `after` may
  embed a simple self-contained SVG schematic inside a fenced block:
      ```svg
      <svg viewBox="0 0 640 220" xmlns="http://www.w3.org/2000/svg"> ... </svg>
      ```
  preceded by a caption line like "Figure 1: <caption>". SCHEMATIC diagrams of the method/pipeline
  only (boxes, arrows, labels, readable at small size) - NEVER fabricated data plots, curves, or
  bar charts with invented numbers. No <script>, no event handlers, no external references.

Produce 2-6 hunks, each targeting a different part of the manuscript."""

REVISION_SCHEMA = {
    "type": "object",
    "properties": {
        "hunks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "before": {"type": "string"},
                    "after": {"type": "string"},
                    "rationale": {"type": "string"},
                    "commentIds": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["before", "after", "rationale", "commentIds"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["hunks"],
    "additionalProperties": False,
}

# S6 proper: not just per-feature weights, but the synthesis — what capped the
# score this cycle (selected-but-not-best-paper reasons included) and what to
# change next cycle. Reads the intermediate features (attributions), the
# reviews, and the meta-review; grounded in them only.
DEFICIENCY_SKILL = """You are the deficiency-report head of a paper-selection model. A cycle just ended:
you get the score, its tier, the NEXT score band to aim for, the feature attributions (signed
weights with verbatim evidence from the manuscript), the reviews digest, and the meta-review.

Explain what kept the score from being higher THIS cycle, as an actionable report for the next
submission. Work ONLY from the given features, reviews, and meta-review — do not invent new
criticisms. For each item: `feature` names the limiting intermediate feature (reuse the
attribution feature names where they apply), `why` explains concretely how it capped the score
(reference the evidence/review point), `action` says what the next revision should do about it.
If the paper already sits in the award band, the report is about the gap to best-paper level.
`headline` is one sentence: the single biggest reason the score stopped where it did."""

DEFICIENCY_SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string"},
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "feature": {"type": "string"},
                    "why": {"type": "string"},
                    "action": {"type": "string"},
                },
                "required": ["feature", "why", "action"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["headline", "items"],
    "additionalProperties": False,
}

TIER_BANDS = [(60, "poster"), (78, "spotlight"), (88, "oral / selection"), (95, "notable-top-5% (best-paper band)")]


def next_band(score: int) -> tuple[Optional[int], str]:
    for cut, label in TIER_BANDS:
        if score < cut:
            return cut, label
    return None, "top of the corpus"


MANUSCRIPT_CHAR_CAP = 24000


def _clip(text: Optional[str]) -> str:
    return (text or "")[:MANUSCRIPT_CHAR_CAP]


def _claude_json(
    system: str,
    user: str,
    schema: dict,
    effort: str = "low",
    max_tokens: int = 8192,
    who: str = "",
) -> dict:
    """One structured-output call; summarized thinking streams to the active
    job (prefixed with `who`) so the UI shows the agent reasoning live."""
    buf = ""
    with _claude.messages.stream(
        model=CLAUDE_MODEL,
        max_tokens=max_tokens,
        system=system,
        thinking={"type": "adaptive", "display": "summarized"},
        output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
        messages=[{"role": "user", "content": user}],
    ) as stream:
        for event in stream:
            if (
                event.type == "content_block_delta"
                and getattr(event.delta, "type", "") == "thinking_delta"
                and getattr(event.delta, "thinking", "")
            ):
                buf += event.delta.thinking
                # Flush on sentence-ish boundaries so lines read naturally.
                while True:
                    cut = max(buf.rfind(". "), buf.rfind("\n"))
                    if cut < 40:
                        break
                    emit("thinking", (f"{who}: " if who else "") + buf[: cut + 1].strip())
                    buf = buf[cut + 1 :]
        msg = stream.get_final_message()
    if buf.strip():
        emit("thinking", (f"{who}: " if who else "") + buf.strip())
    if msg.stop_reason == "refusal":
        raise RuntimeError("claude head refused")
    text = next(b.text for b in msg.content if b.type == "text")
    return json.loads(text)


def run_reviews_live(title: str, text: str) -> list[dict[str, Any]]:
    from concurrent.futures import ThreadPoolExecutor

    parent_emitter = _emitter.get()

    def one(persona):
        name, focus = persona
        token = _emitter.set(parent_emitter)  # propagate into the pool thread
        try:
            emit("step", f"{name} is reading the manuscript ({focus.split(',')[0]} focus)…")
            out = _claude_json(
                REVIEWER_SKILL.format(focus=focus, fewshot=FEWSHOT_REVIEW),
                f"Title: {title}\n\nManuscript:\n{_clip(text)}",
                REVIEW_SCHEMA,
                who=name,
            )
            out["reviewer"] = name
            emit("step", f"{name} finished — rating {out['rating']}/10, {len(out['comments'])} issue(s).")
            # Expansion layer: the concise judgment becomes a full-length
            # ICML review body (kept even when the judgment head is swapped
            # for the served model later).
            try:
                emit("step", f"{name} is writing out the full review…")
                issues = "\n".join(
                    f"- {c['severity']} | {c['section']} | {c['body']}" for c in out["comments"]
                )
                expanded = _claude_json(
                    REVIEW_EXPAND_SKILL,
                    f"Rating: {out['rating']}/10\nSummary: {out['summary']}\nIssues:\n{issues}\n\n"
                    f"Title: {title}\n\nManuscript:\n{_clip(text)}",
                    REVIEW_EXPAND_SCHEMA,
                    max_tokens=4000,
                    who=name,
                )
                out["body"] = expanded["body"]
            except Exception as e:  # noqa: BLE001
                print(f"[sail] review expansion failed for {name}: {e}")
            return out
        finally:
            _emitter.reset(token)

    with ThreadPoolExecutor(max_workers=3) as pool:
        return list(pool.map(one, REVIEWER_PERSONAS))


def thread_as_text(cycle: dict[str, Any]) -> str:
    lines = []
    for m in cycle["thread"]:
        tag = f" (re: {m['replyTo']})" if m.get("replyTo") else ""
        lines.append(f"{m['author']}{tag}: {m['body']}")
    return "\n\n".join(lines)


def run_reviewer_reply_live(cycle: dict[str, Any], reviewer: dict[str, Any], author_msg: dict[str, Any], target_comment: Optional[dict[str, Any]]) -> str:
    review_txt = f"Rating: {reviewer['rating']}\nSummary: {reviewer['summary']}\nIssues:\n" + "\n".join(
        f"- [{c['id']}] {c['severity']} | {c['section']} | {c['body']}"
        for c in cycle["comments"]
        if c.get("reviewer") == reviewer["reviewer"]
    )
    draft_part = ""
    if author_msg.get("attachment") == "revised-draft" and cycle.get("draftManuscript"):
        note = f" Revision log: {cycle['revisionNote'][:600]}" if cycle.get("revisionNote") else ""
        draft_part = (
            f"\n\nThe author attached a revised manuscript draft with this message.{note}\n"
            f"Revised draft:\n{(cycle['draftManuscript'] or '')[:8000]}\n"
        )
    ctx = (
        f"Your review:\n{review_txt}\n\nDiscussion so far:\n{thread_as_text(cycle)}\n\n"
        + (f"The author is replying to your comment {target_comment['id']}: {target_comment['body']}\n\n" if target_comment else "")
        + draft_part
        + f"Author's message:\n{author_msg['body']}"
    )
    emit("step", f"{reviewer['reviewer']} is reading your rebuttal…")
    out = _claude_json(
        REVIEWER_REPLY_SKILL.format(reviewer=reviewer["reviewer"]),
        ctx,
        REPLY_SCHEMA,
        who=reviewer["reviewer"],
    )
    return out["reply"]


# Canonical ICLR rating anchors — the corpus the meta head was trained on uses
# these exact strings; nearest anchor for ratings between the named points.
RATING_ANCHORS = {
    1: "Trivial or wrong",
    2: "Strong rejection",
    3: "reject, not good enough",
    4: "reject, not good enough",
    5: "Marginally below acceptance threshold",
    6: "Marginally above acceptance threshold",
    7: "Good paper, accept",
    8: "accept, good paper",
    9: "Top 15% of accepted papers, strong accept",
    10: "Top 5% of accepted papers, seminal paper",
}
CONFIDENCE_ANCHOR = "You are confident in your assessment, but not absolutely certain"

ABSTRACT_SKILL = """You are preparing the abstract input for a paper-scoring model. Given a manuscript,
return a faithful, self-contained conference abstract (120-200 words) describing what the paper
actually contains - its problem, approach, and reported findings. Use ONLY content present in the
text; never invent results, numbers, or claims. If an abstract already exists but is thin, expand
it with specifics drawn from the body. If the text is not research content, return it verbatim."""

ABSTRACT_SCHEMA = {
    "type": "object",
    "properties": {"abstract": {"type": "string"}},
    "required": ["abstract"],
    "additionalProperties": False,
}


def extract_abstract(text: str) -> Optional[str]:
    """Pull an explicit Abstract section out of the manuscript, if present."""
    m = re.search(
        r"(?im)^#{0,3}\s*abstract\s*:?\s*$\n+([\s\S]*?)(?=\n#{1,3}\s|\n[A-Z0-9][^\n]{0,60}\n\n|\Z)",
        text,
    )
    if not m:
        m = re.search(r"(?is)\babstract\s*[:.]?\s*\n+(.+?)(?=\n\s*\n)", text)
    if m:
        abs_ = m.group(1).strip()
        if len(abs_) > 40:
            return abs_[:2000]
    return None


def abstract_for_meta(title: str, text: str) -> str:
    """The served score head reads abstract + reviews — feed it a real abstract:
    the manuscript's own when substantial, Claude-summarized (grounded) when
    missing or thin, raw head of the text as the last resort."""
    found = extract_abstract(text)
    if found and len(found) >= 300:
        return found
    if LIVE:
        try:
            emit("step", "Preparing the abstract for the score head…")
            out = _claude_json(
                ABSTRACT_SKILL,
                f"Title: {title}\n\nManuscript:\n{_clip(text)}",
                ABSTRACT_SCHEMA,
                who="Abstract prep",
            )
            return out["abstract"][:2000]
        except Exception as e:  # noqa: BLE001
            print(f"[sail] abstract prep failed, using raw head: {e}")
    return (found or text)[:1200]


# Temporal / recency calibration — DATA-DRIVEN, no agent judgment. The served
# heads learned topic->sentiment marginalized over 2018-2026, so a subfield the
# corpus was dense with early on (GANs, LSTMs, plain CNNs, normalization ~2018-20)
# reads as more novel than it is in 2026. We MEASURE that from the corpus: a term
# -> maturity table (topic_maturity.json) holds each topic term's submission-share
# in 2018-2020 vs 2024-2026. We scan the abstract for those terms and inject a
# note grounded in the actual numbers — Claude never decides "X is mature".
SAIL_FIELD_CONTEXT = os.environ.get("SAIL_FIELD_CONTEXT", "1") != "0"
TOPIC_MATURITY_PATH = os.environ.get("TOPIC_MATURITY_PATH", "/opt/sail/topic_maturity.json")
MATURITY_INJECT_THRESHOLD = 1.3  # log-ratio; ~3.7x share decline (e.g. GAN, LSTM)
MATURITY_RECENT_FLOOR = 0.5      # a flagged topic must have nearly vanished (<0.5%
                                 # of 2024-26 submissions) — this separates a DEAD
                                 # topic (GAN 0.19%, LSTM 0.08%) from one that merely
                                 # became infrastructure (convolutional 1.08%, SGD 0.95%)

_MATURITY: dict[str, Any] = {}
try:
    with open(TOPIC_MATURITY_PATH, encoding="utf-8") as _f:
        _MATURITY = json.load(_f).get("terms", {})
    print(f"[sail] topic maturity table: {len(_MATURITY)} terms")
except (FileNotFoundError, json.JSONDecodeError):
    print("[sail] topic maturity table not found — recency calibration off")

_TERM_RE = {t: re.compile(rf"(?<![a-z0-9]){re.escape(t)}(?![a-z0-9])") for t in _MATURITY}


def field_context(title: str, abstract: str) -> tuple[str, dict[str, Any]]:
    """Corpus-measured recency note (may be empty). Scans the text for known
    topic terms; a paper dominated by a genuinely rising topic is never flagged
    even if it mentions a mature component. Returns (note, audit)."""
    if not (SAIL_FIELD_CONTEXT and _MATURITY):
        return "", {}
    blob = f"{title}\n{abstract}".lower()
    mature, rising = [], []
    for t, meta in _MATURITY.items():
        if _TERM_RE[t].search(blob):
            (mature if meta["maturity"] > 0 else rising).append((t, meta))
    # A flag needs BOTH a strong share decline AND near-disappearance now — so
    # a dead topic qualifies but a matured-into-infrastructure one does not.
    candidates = [
        (t, m) for t, m in mature
        if m["maturity"] >= MATURITY_INJECT_THRESHOLD and m["recent_pct"] < MATURITY_RECENT_FLOOR
    ]
    if not candidates:
        return "", {}
    top_mat = max(candidates, key=lambda x: x[1]["maturity"])
    top_rise = max((r[1]["maturity"] * -1 for r in rising), default=0.0)
    # Suppress when the paper is really about a current topic (a rising term at
    # least as strong as the mature signal — e.g. a diffusion model using CNNs).
    if top_rise >= top_mat[1]["maturity"]:
        return "", {}
    term, m = top_mat
    emit("step", f"Recency calibration: '{term}' is a matured area in the corpus (down-weighting).")
    note = (
        f"This work centers on '{term}', a subfield the review corpus shows is mature and "
        f"saturated as of 2026: it appeared in {m['early_pct']:.1f}% of 2018-2020 submissions "
        f"but only {m['recent_pct']:.2f}% in 2024-2026. Judge novelty against a well-trodden, "
        f"heavily-published baseline rather than an emerging one."
    )
    audit = {"term": term, "maturity": m["maturity"],
             "early_pct": m["early_pct"], "recent_pct": m["recent_pct"],
             "mature_terms": [t for t, _ in mature][:8], "rising_terms": [t for t, _ in rising][:8]}
    return note, audit


def run_vessl_score(title: str, cycle: dict[str, Any]) -> int:
    """Trained selectivity score head (frozen v2 backbone + regression head,
    test_2023 Spearman 0.872, award-percentile 98.7). Serving: /score on the
    same workspace. Raises on any failure — caller falls back to the
    p_accept^0.25 calibration chain."""
    reviews_fmt = []
    for r in cycle["reviews"]:
        rating = max(1, min(10, int(r["rating"])))
        head = f"Rating: {rating}: {RATING_ANCHORS[rating]} | Confidence: 4: {CONFIDENCE_ANCHOR}\n"
        if r.get("body"):
            reviews_fmt.append(head + r["body"])
            continue
        issues = "\n".join(
            f"- {c['severity']} | {c['section']} | {c['body']}"
            for c in cycle["comments"]
            if c.get("reviewer") == r["reviewer"]
        )
        reviews_fmt.append(
            head + f"[Summary Of The Paper] {r['summary']}\n[Strength And Weaknesses]\n{issues}"
        )
    emit("step", "Trained score head is reading the reviews…")
    resp = httpx.post(f"{VESSL_META_URL}/score", json={
        "title": title, "venue": "ICML 2026", "reviews": reviews_fmt,
        "abstract": abstract_for_meta(title, cycle["manuscript"].get("text") or ""),
    }, timeout=120.0)
    resp.raise_for_status()
    return max(1, min(99, round(float(resp.json()["score"]))))


def run_vessl_meta(title: str, cycle: dict[str, Any]) -> dict[str, Any]:
    reviews_fmt = []
    for r in cycle["reviews"]:
        rating = max(1, min(10, int(r["rating"])))
        head = f"Rating: {rating}: {RATING_ANCHORS[rating]} | Confidence: 4: {CONFIDENCE_ANCHOR}\n"
        if r.get("body"):
            # Expanded full-length review — matches the length distribution of
            # the meta head's training input (input_reviews_text, ~2.9k chars).
            reviews_fmt.append(head + r["body"])
            continue
        issues = "\n".join(
            f"- {c['severity']} | {c['section']} | {c['body']}"
            for c in cycle["comments"]
            if c.get("reviewer") == r["reviewer"]
        )
        reviews_fmt.append(
            head + f"[Summary Of The Paper] {r['summary']}\n[Strength And Weaknesses]\n{issues}"
        )
    abstract = abstract_for_meta(title, cycle["manuscript"].get("text") or "")
    # Recency calibration: prepend a corpus-measured maturity note so the head's
    # topic prior is corrected for time. Stored on the cycle for the UI/audit.
    note, audit = field_context(title, abstract)
    if note:
        cycle["fieldContext"] = {"note": note, **audit}
        abstract = f"[Field context (2026): {note}]\n\n{abstract}"
    payload: dict[str, Any] = {
        "model": VESSL_META_MODEL,
        "title": title,
        "venue": "ICML 2026",
        "reviews": reviews_fmt,
        "abstract": abstract,
    }
    # Serving contract: [{"who": str, "text": str}] — the server renders each
    # entry as "### {who} response", so the label must carry the speaker.
    discussion = []
    for m in cycle["thread"]:
        body = m["body"]
        if m.get("attachment") == "revised-draft":
            body += "\n[The authors attached a revised manuscript with this response.]"
        discussion.append({"who": m["author"], "text": body})
    if discussion:
        payload["discussion"] = discussion
    emit("step", "Area Chair (VESSL LoRA) is synthesizing the reviews and the discussion…")
    # The serving workspace briefly returns 502/503 while hot-loading a new
    # adapter — back off and retry instead of silently degrading to fallback.
    for attempt in range(4):
        resp = httpx.post(f"{VESSL_META_URL}/meta-review", json=payload, timeout=180.0)
        if resp.status_code in (502, 503) and attempt < 3:
            emit("step", "Score head is reloading — retrying in 8s…")
            time.sleep(8)
            continue
        break
    resp.raise_for_status()
    emit("step", "Meta-review drafted — calibrating the selection score…")
    return resp.json()


def run_attributions_live(title: str, text: str, score: int) -> list[dict[str, Any]]:
    emit("step", "Explanation head is extracting feature attributions with verbatim evidence…")
    out = _claude_json(
        ATTRIBUTION_SKILL,
        f"Selection score: {score}/100\nTitle: {title}\n\nManuscript:\n{_clip(text)}",
        ATTRIBUTION_SCHEMA,
        who="Explanation head",
    )
    return out["attributions"]


def run_deficiency_live(
    title: str,
    cycle: dict[str, Any],
    score: int,
    attributions: list[dict[str, Any]],
    meta_text: str,
) -> dict[str, Any]:
    emit("step", "Explanation head is tracing what capped the score this cycle…")
    cut, label = next_band(score)
    target = f"{cut} ({label})" if cut else label
    attrs = "\n".join(
        f"- {a['feature']}: weight {a['weight']:+.2f}"
        + (f" | evidence: {' / '.join(a['evidence'][:2])}" if a.get("evidence") else "")
        for a in attributions
    )
    reviews_digest = "\n".join(
        f"- {r['reviewer']} (rating {r['rating']}): {r['summary']}" for r in cycle["reviews"]
    )
    out = _claude_json(
        DEFICIENCY_SKILL,
        f"Title: {title}\nScore this cycle: {score}/100 (tier: {tier_for(score)})\n"
        f"Next band to aim for: {target}\n\nFeature attributions:\n{attrs}\n\n"
        f"Reviews digest:\n{reviews_digest}\n\nMeta-review:\n{meta_text}",
        DEFICIENCY_SCHEMA,
        who="Deficiency report",
    )
    out["items"] = out["items"][:5]
    out["targetBand"] = target
    return out


def fallback_deficiency(score: int, attributions: list[dict[str, Any]]) -> dict[str, Any]:
    cut, label = next_band(score)
    target = f"{cut} ({label})" if cut else label
    negatives = sorted((a for a in attributions if a["weight"] < 0), key=lambda a: a["weight"])
    items = [
        {
            "feature": a["feature"],
            "why": f"This feature pulled the score down ({a['weight']:+.2f}) this cycle.",
            "action": f"Address {a['feature']} directly in the next revision and surface the change in the abstract.",
        }
        for a in negatives[:4]
    ] or [
        {
            "feature": "empirical breadth",
            "why": "No single feature dominates, but the aggregate evidence stops short of the next band.",
            "action": "Broaden the evaluation and tighten claims to push into the next band.",
        }
    ]
    return {
        "headline": f"The score stopped at {score} mainly on {items[0]['feature']} — the next band is {target}.",
        "items": items,
        "targetBand": target,
    }


def run_revision_draft_live(title: str, cycle: dict[str, Any]) -> list[dict[str, Any]]:
    comments_txt = "\n".join(
        f"- [{c['id']}] ({c.get('reviewer','?')}) {c['severity']} | {c['section']} | {c['body']}"
        for c in cycle["comments"]
    )
    emit("step", "Revision agent is studying the open comments and the discussion…")
    out = _claude_json(
        REVISION_SKILL,
        f"Title: {title}\n\nReview comments:\n{comments_txt}\n\nDiscussion so far:\n"
        f"{thread_as_text(cycle)}\n\nCurrent manuscript:\n{_clip(cycle['manuscript'].get('text'))}",
        REVISION_SCHEMA,
        effort="medium",
        max_tokens=16000,
        who="Revision agent",
    )
    emit("step", f"Revision agent drafted {len(out['hunks'])} candidate change(s) — anchoring them to the manuscript…")
    text = cycle["manuscript"].get("text") or ""

    def anchor(before: str) -> Optional[str]:
        """Resolve the model's `before` to the exact substring in the text —
        tolerating whitespace/newline drift via a whitespace-insensitive match."""
        if before in text:
            return before
        pat = r"\s+".join(re.escape(w) for w in before.split())
        m = re.search(pat, text)
        return m.group(0) if m else None

    hunks = []
    for i, h in enumerate(out["hunks"]):
        anchored = anchor(h["before"])
        if anchored:
            hunks.append({"id": f"h{i}", **h, "before": anchored})
    if out["hunks"] and not hunks:
        # The model drafted changes but none anchored — degrade rather than
        # returning an empty draft for a manuscript that has real substance.
        print("[sail] revision hunks failed to anchor, using fallback hunks")
        return fallback_hunks(cycle)
    return hunks


# --------------------------------------------------------------------------
# Cycle construction
# --------------------------------------------------------------------------


def build_reviews(paper_id: str, cycle_no: int, title: str, text: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Run the review head; returns (reviews, comments) with reviewer provenance."""
    def fallback_raw() -> list[dict[str, Any]]:
        out = []
        for n, rt, s, cs in FALLBACK_REVIEWS:
            emit("step", f"{n} is reading the manuscript…")
            time.sleep(0.4)
            out.append({"reviewer": n, "rating": rt, "summary": s, "comments": [{"severity": sv, "section": sec, "body": b} for sv, sec, b in cs]})
            emit("step", f"{n} finished — rating {rt}/10, {len(cs)} issue(s).")
        return out

    raw: list[dict[str, Any]]
    if LIVE:
        try:
            raw = run_reviews_live(title, text)
        except Exception as e:  # noqa: BLE001
            print(f"[sail] review head failed, using fallback: {e}")
            raw = fallback_raw()
    else:
        raw = fallback_raw()
    reviews, comments = [], []
    ci = 0
    for i, r in enumerate(raw):
        review: dict[str, Any] = {
            "id": f"{paper_id}_cy{cycle_no}_r{i}",
            "reviewer": r["reviewer"],
            "rating": int(r["rating"]),
            "summary": r["summary"],
        }
        if r.get("body"):
            review["body"] = r["body"]
        # Venue review-form facets (optional in the contract; UI has fallbacks)
        for k, hi in (("confidence", 5), ("soundness", 4), ("presentation", 4), ("contribution", 4)):
            if isinstance(r.get(k), int):
                review[k] = max(1, min(hi, r[k]))
        if r.get("strengths"):
            review["strengths"] = [s for s in r["strengths"] if isinstance(s, str)][:3]
        reviews.append(review)
        for c in r["comments"]:
            comments.append(
                {
                    "id": f"{paper_id}_cy{cycle_no}_c{ci}",
                    "cycle": cycle_no,
                    "reviewer": r["reviewer"],
                    "severity": c["severity"],
                    "section": c["section"],
                    "body": c["body"],
                }
            )
            ci += 1
    return reviews, comments


def new_cycle(paper_id: str, cycle_no: int, title: str, manuscript: dict[str, Any]) -> dict[str, Any]:
    reviews, comments = build_reviews(paper_id, cycle_no, title, manuscript.get("text") or "")
    return {
        "cycle": cycle_no,
        "createdAt": _now(),
        "manuscript": manuscript,
        "reviews": reviews,
        "comments": comments,
        "thread": [],
        # pendingRevision / draftManuscript / metaReview / score / decision appear later
    }


def _msg(cycle: dict[str, Any], role: str, author: str, body: str, reply_to: Optional[str] = None) -> dict[str, Any]:
    m = {
        "id": f"m{len(cycle['thread'])}_{cycle['cycle']}",
        "role": role,
        "author": author,
        "body": body,
        "createdAt": _now(),
    }
    if reply_to:
        m["replyTo"] = reply_to
    cycle["thread"].append(m)
    return m


# --------------------------------------------------------------------------
# Manuscript handling
# --------------------------------------------------------------------------


def extract_pdf_text(data: bytes) -> str:
    if fitz is None:
        raise HTTPException(500, "pymupdf not installed on the server")
    try:
        with fitz.open(stream=data, filetype="pdf") as doc:
            return "\n\n".join(page.get_text() for page in doc).strip()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(422, f"could not extract text from PDF: {e}") from e


async def manuscript_from_upload(text: Optional[str], file: Optional[UploadFile]) -> dict[str, Any]:
    if file is not None:
        extracted = extract_pdf_text(await file.read())
        merged = f"{text.strip()}\n\n---\n\n{extracted}" if text and text.strip() else extracted
        return {"kind": "text", "text": merged, "fileName": file.filename}
    return {"kind": "text", "text": text or ""}


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------


def _find(paper_id: str) -> dict[str, Any]:
    for p in _state["papers"]:
        if p["id"] == paper_id:
            return p
    raise HTTPException(404, f"paper {paper_id} not found")


def _cycle(paper: dict[str, Any]) -> dict[str, Any]:
    return paper["cycles"][-1]


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {
        "status": "ok",
        "papers": str(len(_state["papers"])),
        "live": str(LIVE),
        "vessl": VESSL_META_URL,
        "contract": "v2-cycles",
    }


@app.get("/api/loop/papers")
def list_papers() -> list[dict[str, Any]]:
    return _state["papers"]


@app.get("/api/loop/papers/{paper_id}")
def get_paper(paper_id: str) -> dict[str, Any]:
    return _find(paper_id)


@app.delete("/api/loop/papers/{paper_id}")
def delete_paper(paper_id: str) -> dict[str, Any]:
    with _lock:
        paper = _find(paper_id)
        _state["papers"].remove(paper)
        _save_state()
    return {"ok": True, "id": paper_id}


def _do_submit(title: str, manuscript: dict[str, Any]) -> dict[str, Any]:
    emit("step", "Submission received — assigning three reviewers…")
    with _lock:
        paper_id = f"lp_{_state['seq']}"
        _state["seq"] += 1
    cycle = new_cycle(paper_id, 1, title, manuscript)
    with _lock:
        paper = {
            "id": paper_id,
            "title": title,
            "abstract": (manuscript.get("text") or "").strip()[:280],
            "status": "in_discussion",
            "currentCycle": 1,
            "cycles": [cycle],
            "createdAt": _now(),
        }
        _state["papers"].insert(0, paper)
        _save_state()
    emit("step", "All three reviews are in — the discussion phase is open.")
    return paper


@app.post("/api/loop/papers")
async def submit(
    title: str = Form(...),
    text: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    mode: Optional[str] = None,
) -> dict[str, Any]:
    if not title.strip() or (not (text or "").strip() and file is None):
        raise HTTPException(422, "A title and a manuscript (text or PDF) are required.")
    manuscript = await manuscript_from_upload(text, file)
    if mode == "async":
        job = _new_job("submit")
        _run_job(job, lambda: _do_submit(title, manuscript))
        return {"jobId": job["id"]}
    return _do_submit(title, manuscript)


VALID_OPS = {"reply", "revision-draft", "finalize", "resubmit"}


@app.post("/api/loop/papers/{paper_id}/jobs")
def start_job(paper_id: str, body: dict[str, Any] = Body(...)) -> dict[str, Any]:
    """Run a long operation as an agent job; poll GET /api/loop/jobs/{id} for
    live progress events (harness steps + Claude thinking summaries)."""
    op = body.get("op")
    payload = body.get("payload") or {}
    if op not in VALID_OPS:
        raise HTTPException(422, f"op must be one of {sorted(VALID_OPS)}")
    _find(paper_id)  # 404 early, before the thread starts
    job = _new_job(op)

    def run() -> dict[str, Any]:
        if op == "reply":
            return reply(paper_id, payload)
        if op == "revision-draft":
            return revision_draft(paper_id)
        if op == "finalize":
            return finalize(paper_id)
        return resubmit(paper_id)

    _run_job(job, run)
    return {"jobId": job["id"]}


@app.get("/api/loop/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, f"job {job_id} not found")
    return job


@app.post("/api/loop/papers/{paper_id}/manuscript")
def edit_manuscript(paper_id: str, body: dict[str, Any] = Body(...)) -> dict[str, Any]:
    """The author edits the manuscript directly (per reviewer feedback). The
    edit lands on the cycle's revised draft and is logged into the thread."""
    text = body.get("text")
    if not isinstance(text, str) or not text.strip():
        raise HTTPException(422, "manuscript text required")
    with _lock:
        paper = _find(paper_id)
        if paper["status"] == "decided":
            raise HTTPException(409, "cycle already decided — resubmit to continue")
        cyc = _cycle(paper)
        # No thread message: the draft rides as an attachment chip and is
        # delivered to the reviewers with the author's NEXT message.
        cyc["draftManuscript"] = text
        _save_state()
    return paper


@app.delete("/api/loop/papers/{paper_id}/draft")
def discard_draft(paper_id: str) -> dict[str, Any]:
    """Discard the pending revised draft (the chip's ✕)."""
    with _lock:
        paper = _find(paper_id)
        cyc = _cycle(paper)
        cyc.pop("draftManuscript", None)
        cyc.pop("revisionNote", None)
        _save_state()
    return paper


@app.post("/api/loop/papers/{paper_id}/reply")
def reply(paper_id: str, body: dict[str, Any] = Body(...)) -> dict[str, Any]:
    text = (body.get("text") or "").strip()
    reply_to = body.get("replyTo")
    if not text:
        raise HTTPException(422, "reply text required")
    with _lock:
        paper = _find(paper_id)
        cyc = _cycle(paper)
        if paper["status"] == "decided":
            raise HTTPException(409, "cycle already decided — resubmit to continue")
        author_msg = _msg(cyc, "author", "Author", text, reply_to)
        # A pending revised draft is delivered WITH the author's message.
        if cyc.get("draftManuscript"):
            author_msg["attachment"] = "revised-draft"

        # Which reviewers respond: the comment's owner if targeted, else all whose
        # concerns the message plausibly touches (fallback: first two).
        target_comment = next((c for c in cyc["comments"] if c["id"] == reply_to), None)
        if target_comment:
            responders = [r for r in cyc["reviews"] if r["reviewer"] == target_comment.get("reviewer")]
        else:
            responders = cyc["reviews"][:2]
        for r in responders:
            if LIVE:
                try:
                    reply_text = run_reviewer_reply_live(cyc, r, author_msg, target_comment)
                except Exception as e:  # noqa: BLE001
                    print(f"[sail] reviewer reply head failed, using fallback: {e}")
                    reply_text = FALLBACK_REPLY.format(topic=(target_comment or {}).get("section", "the raised points"))
            else:
                reply_text = FALLBACK_REPLY.format(topic=(target_comment or {}).get("section", "the raised points"))
            _msg(cyc, "reviewer", r["reviewer"], reply_text, author_msg["id"])
        _save_state()
    return paper


@app.post("/api/loop/papers/{paper_id}/revision-draft")
def revision_draft(paper_id: str) -> dict[str, Any]:
    with _lock:
        paper = _find(paper_id)
        cyc = _cycle(paper)
        if paper["status"] == "decided":
            raise HTTPException(409, "cycle already decided — resubmit to continue")
        if LIVE:
            try:
                hunks = run_revision_draft_live(paper["title"], cyc)
            except Exception as e:  # noqa: BLE001
                print(f"[sail] revision agent failed, using fallback: {e}")
                hunks = fallback_hunks(cyc)
        else:
            hunks = fallback_hunks(cyc)
        cyc["pendingRevision"] = {"hunks": hunks, "createdAt": _now()}
        _save_state()
    return paper


@app.post("/api/loop/papers/{paper_id}/revision-apply")
def revision_apply(paper_id: str, body: dict[str, Any] = Body(...)) -> dict[str, Any]:
    decisions: dict[str, bool] = body.get("decisions") or {}
    with _lock:
        paper = _find(paper_id)
        cyc = _cycle(paper)
        pending = cyc.get("pendingRevision")
        if not pending:
            raise HTTPException(409, "no pending revision draft")
        text = cyc["manuscript"].get("text") or ""
        applied, declined = [], []
        for h in pending["hunks"]:
            h["decision"] = "allowed" if decisions.get(h["id"]) else "denied"
            if h["decision"] == "allowed" and h["before"] in text:
                text = text.replace(h["before"], h["after"], 1)
                applied.append(h)
            else:
                declined.append(h)
        cyc["draftManuscript"] = text

        # The allow/deny log becomes DRAFT rebuttal text: it pre-fills the
        # composer for the author to edit and send — no ghost message that
        # nobody answers lands in the thread by itself.
        parts = []
        if applied:
            parts.append(
                "We revised the manuscript as follows: "
                + " ".join(f"({i+1}) {h['rationale']}" for i, h in enumerate(applied))
            )
        if declined:
            parts.append(
                "We considered but did not adopt: "
                + " ".join(f"({i+1}) {h['rationale']}" for i, h in enumerate(declined))
            )
        cyc["revisionNote"] = " ".join(parts) or "We reviewed the proposed revision and made no changes."
        _save_state()
    return paper


@app.post("/api/loop/papers/{paper_id}/finalize")
def finalize(paper_id: str) -> dict[str, Any]:
    with _lock:
        paper = _find(paper_id)
        cyc = _cycle(paper)
        if paper["status"] == "decided":
            return paper
        title = paper["title"]
        text = cyc["manuscript"].get("text") or ""

        meta_text: Optional[str] = None
        score: Optional[int] = None
        head_scored = False
        if LIVE:
            if SAIL_SCORE_HEAD:
                try:
                    # trained score head first — already calibrated on the real
                    # selectivity distribution, so no rating-anchor blend needed
                    score = run_vessl_score(title, cyc)
                    head_scored = True
                except Exception as e:  # noqa: BLE001
                    print(f"[sail] score head failed, falling back: {e}")
            try:
                meta = run_vessl_meta(title, cyc)
                meta_text = meta.get("meta_review")
                if score is None and isinstance(meta.get("p_accept"), (int, float)):
                    score = calibrate_p_accept(float(meta["p_accept"]))
            except Exception as e:  # noqa: BLE001
                print(f"[sail] vessl meta head failed: {e}")
        if score is None:
            score = CYCLE_SCORES[min(cyc["cycle"] - 1, len(CYCLE_SCORES) - 1)]
        if not head_scored:
            ratings = [r["rating"] for r in cyc["reviews"] if isinstance(r.get("rating"), int)]
            if ratings:
                anchor = (sum(ratings) / len(ratings)) * 10
                score = max(1, min(99, round(0.6 * score + 0.4 * anchor)))
        if meta_text is None:
            applied = sum(1 for h in (cyc.get("pendingRevision", {}).get("hunks") or []) if h.get("decision") == "allowed")
            denied = sum(1 for h in (cyc.get("pendingRevision", {}).get("hunks") or []) if h.get("decision") == "denied")
            meta_text = fallback_meta(cyc["cycle"], len(cyc["thread"]), applied, denied)

        attributions: list[dict[str, Any]]
        if LIVE:
            try:
                attributions = run_attributions_live(title, text, score)
            except Exception as e:  # noqa: BLE001
                print(f"[sail] attribution head failed, using fallback: {e}")
                attributions = fallback_attributions(text, score)
        else:
            attributions = fallback_attributions(text, score)

        if LIVE:
            try:
                deficiency = run_deficiency_live(title, cyc, score, attributions, meta_text)
            except Exception as e:  # noqa: BLE001
                print(f"[sail] deficiency head failed, using fallback: {e}")
                deficiency = fallback_deficiency(score, attributions)
        else:
            deficiency = fallback_deficiency(score, attributions)

        cyc["metaReview"] = meta_text
        cyc["deficiency"] = deficiency
        cyc["score"] = {
            "cycle": cyc["cycle"],
            "score": score,
            "selectThreshold": SELECT_THRESHOLD,
            "gradeTier": tier_for(score),
            "attributions": attributions,
            "layers": layers_for_score(score),
        }
        cyc["decision"] = "accept" if score >= SELECT_THRESHOLD else "reject"
        # OpenReview-style Program Chairs decision post (oral for the top band)
        if cyc["decision"] == "accept":
            pd = "Accept (Oral)" if score >= 95 else "Accept (Poster)"
            pc = "The committee recommends acceptance; congratulations to the authors."
        else:
            pd = "Reject"
            pc = "The committee recommends rejection this cycle; the authors are encouraged to revise and resubmit."
        cyc["decisionPost"] = {"decision": pd, "comment": pc, "createdAt": _now()}
        _msg(cyc, "ac", "Area Chair", meta_text)
        paper["status"] = "decided"
        _save_state()
    return paper


@app.post("/api/loop/papers/{paper_id}/resubmit")
def resubmit(paper_id: str) -> dict[str, Any]:
    with _lock:
        paper = _find(paper_id)
        cyc = _cycle(paper)
        if paper["status"] != "decided":
            raise HTTPException(409, "finalize the current cycle before resubmitting")
        base_text = cyc.get("draftManuscript") or cyc["manuscript"].get("text") or ""
        manuscript = {**cyc["manuscript"], "text": base_text}
        next_no = cyc["cycle"] + 1
        # Fresh context: the new cycle carries only the manuscript — reviews are
        # re-run from scratch, the previous thread stays on the old cycle.
        paper["cycles"].append(new_cycle(paper["id"], next_no, paper["title"], manuscript))
        paper["currentCycle"] = next_no
        paper["status"] = "in_discussion"
        _save_state()
    return paper


# --------------------------------------------------------------------------
# Frontend (optional) — serve the built SPA from WEB_DIST
# --------------------------------------------------------------------------

# --------------------------------------------------------------------------
# Standalone score endpoint — thin proxy to the VESSL score head, so consumers
# get a stable GCP-owned URL without touching the model serving layer.
# (kit docs/ENDPOINTS.md §1 — restored after today's redeploys overwrote it.)
# --------------------------------------------------------------------------


@app.post("/api/score")
def api_score(body: dict = Body(...)) -> dict:
    """POST {title, reviews[], venue?, abstract?, discussion?}
    -> {pred: 0-1 selectivity, score: 0-100 calibrated}. Proxies
    {VESSL_META_URL}/score (trained regression head, test_2023 Spearman 0.872)."""
    try:
        r = httpx.post(f"{VESSL_META_URL}/score", json={
            "title": body.get("title", ""),
            "venue": body.get("venue", "ICML 2026"),
            "reviews": body.get("reviews") or [],
            "abstract": body.get("abstract"),
            "discussion": body.get("discussion"),
        }, timeout=120.0)
        r.raise_for_status()
        return r.json()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(503, f"score head unavailable: {e}")


WEB_DIST = os.environ.get("WEB_DIST", "/opt/sail/web")

if os.path.isdir(WEB_DIST):
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    app.mount("/assets", StaticFiles(directory=os.path.join(WEB_DIST, "assets")), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        candidate = os.path.join(WEB_DIST, path)
        if path and ".." not in path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(WEB_DIST, "index.html"))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8100")))
