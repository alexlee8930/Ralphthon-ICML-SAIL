# Review Agent — ICML SAIL with Ralph (Track 2 submission · max 4 pages)

- **Name/version**: SAIL Review Agent v1 (frozen 2026-07-12)
- **Stack**: 3 parallel reviewer heads (Claude `claude-opus-4-8`, neutral — no personas)
  → ICML-length reasoning expansion → trained selectivity score head
  (Qwen3-8B frozen backbone + regression head, test_2023 Spearman 0.872,
  award-percentile median 98.7) → AC meta-review head (Qwen3-8B LoRA v21,
  decision-logit accuracy 89.1%, AUC 0.965). Serving: VESSL L40S; product API on GCE.
- **Reproducibility**: full rebuild spec in `sail-spec/` (this bundle);
  live endpoint `POST /api/loop/papers` → `POST …/finalize`.

## Approach (why this design — every decision is measured, not vibed)

Most review agents are a single LLM prompt. Ours splits the venue's actual decision
process into heads with different epistemic jobs — **generative judgment where a
current-knowledge model is strongest (reviewer), learned aggregation where 47k real
OpenReview decisions are strongest (score/meta)** — and every calibration in between
is derived from corpus measurements, not intuition:

| Design decision | Measured evidence behind it |
|---|---|
| Trained score head ranks; reviews carry the signal | leave-one-out: removing one review moves the decision margin ±12; abstract edits move it ±0.4 |
| Corpus-measured recency calibration (1,872-term maturity table), agent judgment excluded | topic prior measured at p_accept 0.99 (normalization) vs 0.003 (LLM agents) under identical neutral reviews; GAN share 6.1%→0.19% in-corpus |
| Confidence handled by the harness, not trusted raw | measured: rating 6 flips 0.001→0.924 when reviewer confidence drops (head regresses to its 82%-accept prior) |
| Claude reviewer (not the fine-tuned reviewer head) | the SFT reviewer trained on accept-only fulltexts scores rej-recall 0.08 — measured, so we refused to ship it |
| Rank by continuous `pred`, not the clamped 1–99 score | 2-paper live dry-run: strong 0.3675 vs weak 0.0940 (4× separation on 4-page inputs) |
| Grounding rules (no fabricated numbers; placeholder → rating 1) | red-team test: a one-line placeholder previously yielded a fabricated 99-score review; rules eliminate it |

## Procedure (what the agent does with a paper)

1. **Three independent reviews.** Each reviewer reads the full paper text and returns
   a calibrated ICLR-style rating (1–10, canonical anchor phrases), a summary, 2–3
   located issues (severity × section), venue form facets (soundness / presentation /
   contribution 1–4, confidence 1–5), and 1–3 grounded strengths.
2. **Grounding rules (hard).** No fabricated experiments, results, or citations.
   Numbers and claims must exist in the submitted text. Placeholder or non-research
   text → rating 1 and no revision suggestions. A short but genuine abstract is
   reviewable (2–4 range), not desk-rejected.
3. **Expansion.** Each judgment is expanded to a full ICML-length review body
   (350–550 words: [Summary Of The Paper] / [Strength And Weaknesses] / [Questions])
   — the head owns the judgment, the expansion only adds reasoning depth.
4. **Scoring.** Reviews (rating + confidence anchors + bodies) and the abstract go to
   the trained selectivity score head (`/score` → calibrated 1–99 + continuous `pred`).
   Recency calibration: a corpus-measured topic-maturity table (1,872 terms,
   2018-20 vs 2024-26 submission shares) flags dead-topic inflation; agent judgment
   is never used for this — only measured frequencies.
5. **Meta-review.** The AC head synthesizes reviews + any author discussion
   (self-review is injected as an `Authors` discussion turn) into a meta-review.

## Output (per reviewed paper — official Track 2 template)

Render the agent state into exactly these sections:

- **Paper and Evidence Identity** — agent name/version above; paper file hash;
  evidence bundle = the submitted paper text (+ self-review if provided).
- **Summary** — consensus of the three reviewer summaries.
- **Strengths** — union of grounded `strengths` bullets (deduplicated, cited to sections).
- **Weaknesses** — the located issues, ordered by severity, each naming its section.
- **Questions for the Authors** — the [Questions] blocks of the expanded reviews.
- **Scores** — median of the three reviewers per facet:
  Soundness / Presentation / Contribution (1–4), Confidence (1–5);
  Overall recommendation = median rating (1–10) with the head score (1–99) in
  parentheses. **One evidence-backed rationale per score**, quoting the paper.
- **Ethics and Limitations** — flag undisclosed data/compute provenance, missing
  limitation statements, or overclaiming found by any reviewer; otherwise state none.
- **Evidence Trace** — for each central claim of the paper: the section/table/figure
  that supports it, or an explicit `[UNVERIFIABLE]` flag. Any number in the review
  itself must be traceable to the paper text (grounding rule 2).

## Failure modes (declared)

Scores sit low in absolute terms on 4-page workshop papers (the head is calibrated on
main-conference selectivity) — comparisons should use rank / `pred`, not the raw scale.
The reviewer heads share one underlying model; diversity comes from sampling, not
persona priors (deliberate — keeps the trained-head swap meaningful).
