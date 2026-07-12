#!/usr/bin/env python3
"""Track 2 batch scorer — 논문 폴더를 파이프라인에 통과시켜 순위표를 만든다.

사용:
  python3 hackathon_score.py papers/ --base http://<VM_IP>:8100
      papers/<name>.md|.txt          : 논문 본문 (4쪽 마크다운/텍스트)
      papers/<name>.selfreview.md    : (선택) 셀프리뷰 — Authors discussion으로 주입
  → scores.csv: paper, mean_rating, head_score, pred, rank  (+ 콘솔 순위표)

  python3 hackathon_score.py --spearman scores.csv human.csv
      human.csv: paper,score 두 컬럼 — 평가자 점수와의 스피어만 상관 출력

순위는 clamp된 score가 아니라 연속값 pred(0-1, /score 직접 호출)로 매긴다 —
비슷한 품질의 논문 10편 안에서는 pred가 해상도를 가진다 (sail-spec/95 §4).
"""
import argparse, csv, json, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

VESSL = "https://api-wsp-2udsccqmif6o.betelgeuse.cloud.vessl.ai"
RATING_ANCHORS = {1: "Trivial or wrong", 2: "Strong rejection", 3: "Clear rejection",
                  4: "Ok but not good enough - rejection", 5: "Marginally below acceptance threshold",
                  6: "Marginally above acceptance threshold", 7: "Good paper, accept",
                  8: "Top 50% of accepted papers, clear accept",
                  9: "Top 15% of accepted papers, strong accept",
                  10: "Top 5% of accepted papers, seminal paper"}
CONF = ("You are confident in your assessment, but not absolutely certain. It is unlikely, "
        "but not impossible, that you did not understand some parts of the submission or that "
        "you are unfamiliar with some pieces of related work.")


def http(method, url, body=None, timeout=600, form=None):
    if form is not None:
        import urllib.parse
        data = urllib.parse.urlencode(form).encode()
        req = urllib.request.Request(url, data=data, method=method)
    else:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method,
                                     headers={"content-type": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (502, 503) and attempt < 3:
                time.sleep(8); continue
            raise


def fmt_reviews(cycle):
    out = []
    for r in cycle["reviews"]:
        rating = max(1, min(10, int(r["rating"])))
        head = f"Rating: {rating}: {RATING_ANCHORS[rating]} | Confidence: 4: {CONF}\n"
        body = r.get("body") or f"[Summary Of The Paper] {r['summary']}"
        out.append(head + body)
    return out


def score_one(base, path):
    name = path.stem
    text = path.read_text(encoding="utf-8")
    print(f"[{name}] submitting…", flush=True)
    # multipart 대신 urlencoded를 받도록 어댑터가 Form(...)이라 그대로 동작
    paper = http("POST", f"{base}/api/loop/papers", form={"title": name, "text": text})
    pid = paper["id"]
    sr = path.with_suffix("").with_suffix(".selfreview.md")
    if sr.exists():
        print(f"[{name}] injecting self-review as Authors turn…", flush=True)
        paper = http("POST", f"{base}/api/loop/papers/{pid}/reply",
                     body={"text": sr.read_text(encoding='utf-8')[:4000]})
    paper = http("POST", f"{base}/api/loop/papers/{pid}/finalize")
    cyc = paper["cycles"][0]
    ratings = [r["rating"] for r in cyc["reviews"]]
    # 연속 판별값: /score 직접 호출 (어댑터와 동일 포맷)
    abstract = (paper.get("abstract") or text[:1200])
    d = http("POST", f"{VESSL}/score", body={"title": name, "venue": "ICML 2026",
             "reviews": fmt_reviews(cyc), "abstract": abstract}, timeout=180)
    row = {"paper": name, "mean_rating": round(sum(ratings) / len(ratings), 2),
           "head_score": cyc["score"]["score"], "pred": round(float(d["pred"]), 5)}
    print(f"[{name}] rating {row['mean_rating']} | score {row['head_score']} | pred {row['pred']}")
    return row


def spearman(a, b):
    def ranks(v):
        order = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        for pos, i in enumerate(order):
            r[i] = pos + 1
        return r
    ra, rb = ranks(a), ranks(b)
    n = len(a)
    d2 = sum((x - y) ** 2 for x, y in zip(ra, rb))
    return 1 - 6 * d2 / (n * (n * n - 1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("papers", nargs="?", help="논문 폴더")
    ap.add_argument("--base", default="http://8.230.3.211:8100")
    ap.add_argument("--out", default="scores.csv")
    ap.add_argument("--spearman", nargs=2, metavar=("SCORES", "HUMAN"))
    args = ap.parse_args()

    if args.spearman:
        ours = {r["paper"]: float(r["pred"]) for r in csv.DictReader(open(args.spearman[0]))}
        human = {r["paper"]: float(r["score"]) for r in csv.DictReader(open(args.spearman[1]))}
        common = sorted(set(ours) & set(human))
        rho = spearman([ours[k] for k in common], [human[k] for k in common])
        print(f"papers: {len(common)} | Spearman(pred vs human) = {rho:.3f}")
        return

    files = sorted(p for p in Path(args.papers).iterdir()
                   if p.suffix in (".md", ".txt") and ".selfreview" not in p.name)
    if not files:
        sys.exit("no .md/.txt papers found")
    with ThreadPoolExecutor(max_workers=3) as ex:
        rows = list(ex.map(lambda p: score_one(args.base, p), files))
    rows.sort(key=lambda r: -r["pred"])
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    with open(args.out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["paper", "mean_rating", "head_score", "pred", "rank"])
        w.writeheader(); w.writerows(rows)
    print(f"\n== ranking (by pred) -> {args.out} ==")
    for r in rows:
        print(f"  #{r['rank']:2} {r['paper']:32} pred {r['pred']:.4f} | score {r['head_score']:3} | rating {r['mean_rating']}")


if __name__ == "__main__":
    main()
