#!/usr/bin/env python3
"""단일 논문 풀 파이프라인 리뷰 — 웹과 동일한 백엔드 경로를 터미널에서.

경로: submit(리뷰어 3인·Opus, ICML 분량 확장, 초록 자동생성, 리센시 보정)
  → (셀프리뷰 있으면 Authors 턴 주입) → finalize(메타리뷰 + 점수 캘리브레이션
  + deficiency) → 공식 Track-2 템플릿(95 §2)으로 렌더 → <paper>.review.md

사용:
  python3 review_paper.py papers/foo.md [--base http://8.230.3.211:8100]
      [--selfreview papers/foo.selfreview.md]  # 없으면 <stem>.selfreview.md 자동탐지
      [--keep]                                  # 서버에 세션 보존(기본 삭제)
키: ANTHROPIC_API_KEY env → 없으면 인접 SECRETS.local.md에서 자동 로드.
"""
import argparse, json, re, statistics, sys, time, urllib.parse, urllib.request
from pathlib import Path

TEMPLATE_SECTIONS = """## Paper and Evidence Identity
## Summary
## Strengths
## Weaknesses
## Questions for the Authors
## Scores
## Ethics and Limitations
## Evidence Trace"""

RENDER_SKILL = """You render the final ICML-style review from a review pipeline's outputs, in EXACTLY the
official Track 2 template sections (given by the user). Hard rules:
- Ground everything in the provided paper text and pipeline outputs. Invent NO findings,
  numbers, or citations that are not in them.
- Summary: consensus of the reviewer summaries. Strengths: deduplicated grounded strengths.
- Weaknesses: the located issues, ordered by severity, each naming its paper section.
- Questions for the Authors: from the reviews' question blocks.
- Scores: use the provided medians verbatim (do not re-judge). One evidence-backed rationale
  per score, quoting or pointing at the paper. Overall recommendation = median rating (1-10)
  with the calibrated score (1-99) in parentheses.
- Ethics and Limitations: flag overclaiming/missing-limitations found by reviewers; else
  state none observed.
- Evidence Trace: for each central claim of the paper, name the supporting section/table/
  figure, or flag [UNVERIFIABLE]. Every number in your review must be traceable.
Write in English. Markdown. No preamble outside the sections."""


def load_key():
    import os
    k = os.environ.get("ANTHROPIC_API_KEY")
    if k:
        return k
    for cand in (Path(__file__).parent.parent / "SECRETS.local.md",
                 Path(__file__).parent / "SECRETS.local.md"):
        if cand.exists():
            m = re.search(r"sk-ant-[A-Za-z0-9_\-]+", cand.read_text())
            if m:
                return m.group(0)
    sys.exit("ANTHROPIC_API_KEY not found (env or SECRETS.local.md)")


def http(method, url, body=None, form=None, headers=None, timeout=600):
    data = (urllib.parse.urlencode(form).encode() if form
            else json.dumps(body).encode() if body is not None else None)
    h = headers or ({} if form else {"content-type": "application/json"})
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    for a in range(4):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 529) and a < 3:
                time.sleep(10); continue
            raise


def sanitize(text):
    """수집기 아티팩트 제거 — 이미지 로컬경로 마크다운, 'text truncated' 꼬리 등."""
    lines = []
    for ln in text.splitlines():
        if re.match(r"!\[.*\]\(/(tmp|var)/", ln.strip()):
            continue
        if ln.strip().lower().startswith("text truncated"):
            break  # 그 아래는 스크래퍼 부록(그림/표 목록)
        lines.append(ln)
    return "\n".join(lines)


def claude_render(key, paper_text, pipeline):
    prompt = (f"PIPELINE OUTPUTS (authoritative for scores):\n"
              f"{json.dumps(pipeline, ensure_ascii=False)[:24000]}\n\n"
              f"PAPER TEXT:\n{paper_text[:28000]}\n\n"
              f"---\nNow write the complete review using EXACTLY these official template "
              f"sections, starting with '## Paper and Evidence Identity':\n{TEMPLATE_SECTIONS}")
    body = {"model": "claude-opus-4-8", "max_tokens": 8192,
            "system": RENDER_SKILL,
            "messages": [{"role": "user", "content": prompt}]}
    for attempt in range(2):
        d = http("POST", "https://api.anthropic.com/v1/messages", body=body,
                 headers={"content-type": "application/json", "x-api-key": key,
                          "anthropic-version": "2023-06-01"}, timeout=300)
        out = "".join(b.get("text", "") for b in d["content"] if b.get("type") == "text")
        if "## Summary" in out and "## Scores" in out:
            return out
        body["messages"].append({"role": "assistant", "content": out})
        body["messages"].append({"role": "user", "content":
            "That did not follow the template. Output ONLY the review in the exact "
            "official sections, starting with '## Paper and Evidence Identity'."})
    return out


def median(vals):
    v = [x for x in vals if isinstance(x, (int, float))]
    return round(statistics.median(v), 1) if v else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paper")
    ap.add_argument("--base", default="http://8.230.3.211:8100")
    ap.add_argument("--selfreview")
    ap.add_argument("--keep", action="store_true")
    ap.add_argument("--out")
    args = ap.parse_args()

    p = Path(args.paper)
    text = sanitize(p.read_text(encoding="utf-8"))
    key = load_key()
    sr = Path(args.selfreview) if args.selfreview else p.with_suffix("").with_suffix(".selfreview.md")

    print(f"[{p.stem}] pipeline: submit (3 reviewers + expansion + abstract/recency)…", flush=True)
    paper = http("POST", f"{args.base}/api/loop/papers", form={"title": p.stem, "text": text})
    pid = paper["id"]
    if sr.exists():
        print(f"[{p.stem}] injecting self-review as Authors turn…", flush=True)
        http("POST", f"{args.base}/api/loop/papers/{pid}/reply",
             body={"text": sr.read_text(encoding='utf-8')[:4000]})
    print(f"[{p.stem}] finalize: AC meta-review + calibrated score…", flush=True)
    paper = http("POST", f"{args.base}/api/loop/papers/{pid}/finalize")
    cyc = paper["cycles"][0]

    revs = cyc["reviews"]
    pipeline = {
        "agent": "SAIL Review Agent v1 (sail-spec/assets/review-agent.md)",
        "paper_title": paper["title"],
        "reviews": [{k: r.get(k) for k in
                     ("reviewer", "rating", "summary", "body", "confidence",
                      "soundness", "presentation", "contribution", "strengths")} for r in revs],
        "located_issues": cyc.get("comments", []),
        "meta_review": cyc.get("metaReview"),
        "score_medians": {
            "overall_rating_1_10": median([r.get("rating") for r in revs]),
            "calibrated_score_1_99": (cyc.get("score") or {}).get("score"),
            "confidence_1_5": median([r.get("confidence") for r in revs]),
            "soundness_1_4": median([r.get("soundness") for r in revs]),
            "presentation_1_4": median([r.get("presentation") for r in revs]),
            "contribution_1_4": median([r.get("contribution") for r in revs]),
        },
        "decision": cyc.get("decision"),
        "deficiency": cyc.get("deficiency"),
        "field_context": cyc.get("fieldContext"),
        "self_review_included": sr.exists(),
    }
    if not args.keep:
        urllib.request.urlopen(urllib.request.Request(
            f"{args.base}/api/loop/papers/{pid}", method="DELETE"), timeout=30)

    print(f"[{p.stem}] rendering official Track-2 review (opus)…", flush=True)
    review = claude_render(key, text, pipeline)
    out = Path(args.out) if args.out else p.with_suffix(".review.md")
    out.write_text(review, encoding="utf-8")
    sm = pipeline["score_medians"]
    print(f"\n== done -> {out}")
    print(f"   rating(med) {sm['overall_rating_1_10']} | score {sm['calibrated_score_1_99']} "
          f"| S/P/C {sm['soundness_1_4']}/{sm['presentation_1_4']}/{sm['contribution_1_4']} "
          f"| conf {sm['confidence_1_5']} | decision {pipeline['decision']}")


if __name__ == "__main__":
    main()
