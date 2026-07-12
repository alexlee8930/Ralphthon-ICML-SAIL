#!/usr/bin/env python3
"""topic_maturity.json 빌더 — 코퍼스에서 토픽 용어별 시간 성숙도를 측정한다.

입력:  train_pairs_with_inputs.csv (paper_title, paper_abstract, year 컬럼 필요)
출력:  topic_maturity.json  {"years": {…}, "terms": {term: {total, early_pct,
       recent_pct, maturity, acc}}}

maturity = log((early_share+EPS)/(recent_share+EPS)); >0 = 하락(성숙), <0 = 상승.
어댑터(sail_adapter.py)는 maturity>=1.3 AND recent_pct<0.5 (죽은 토픽)만 주입하고
상승 용어 동반 시 억제한다 — 판정은 전부 이 측정값이 하며 에이전트 감은 배제.
"""
import csv, json, math, re, sys
from collections import defaultdict

csv.field_size_limit(10**9)

CORPUS = sys.argv[1] if len(sys.argv) > 1 else \
    "/Users/yuchanlee/icml-ac/ralphthon/derived/train_pairs_with_inputs.csv"
OUT = sys.argv[2] if len(sys.argv) > 2 else "topic_maturity.json"

STOP = set("the a an of for to and or in on with we our this that is are be as by "
           "from at using use used based via can new method model models approach "
           "paper results show".split())


def toks(s):
    s = re.sub(r"[^a-z0-9\- ]", " ", s.lower())
    w = [x for x in s.split() if len(x) > 2 and x not in STOP and not x.isdigit()]
    grams = set()
    for i, x in enumerate(w):
        grams.add(x)
        if i + 1 < len(w):
            grams.add(x + " " + w[i + 1])
    return grams


year_tot = defaultdict(int)
ty = defaultdict(lambda: defaultdict(int))
tacc = defaultdict(lambda: [0.0, 0])
with open(CORPUS) as f:
    for row in csv.DictReader(f):
        try:
            y = int(float(row["year"]))
        except (ValueError, KeyError):
            continue
        year_tot[y] += 1
        try:
            sel = float(row["selectivity_target"])
        except (ValueError, KeyError, TypeError):
            sel = None
        for t in toks(row.get("paper_title", "") + " " + row.get("paper_abstract", "")):
            ty[t][y] += 1
            if sel is not None:
                tacc[t][0] += sel
                tacc[t][1] += 1


def cshare(t, lo, hi):
    num = sum(ty[t].get(y, 0) for y in range(lo, hi + 1))
    den = sum(year_tot.get(y, 0) for y in range(lo, hi + 1))
    return num, (num / den if den else 0)


EPS = 0.0008
table = {}
for t, ys in ty.items():
    if sum(ys.values()) < 40:
        continue
    ne, e = cshare(t, 2018, 2020)
    nr, rr = cshare(t, 2024, 2026)
    if ne < 5:  # "성숙"하려면 초기 존재감이 있어야 한다
        continue
    maturity = math.log((e + EPS) / (rr + EPS))
    acc = tacc[t][0] / tacc[t][1] if tacc[t][1] else None
    table[t] = {"total": sum(ys.values()), "early_pct": round(e * 100, 3),
                "recent_pct": round(rr * 100, 3), "maturity": round(maturity, 3),
                "acc": round(acc, 3) if acc is not None else None}

keep = {t: m for t, m in table.items() if abs(m["maturity"]) >= 0.8}
json.dump({"years": dict(year_tot), "terms": keep}, open(OUT, "w"))
mature = sum(1 for m in keep.values() if m["maturity"] > 0)
print(f"kept {len(keep)} informative terms ({mature} mature / {len(keep)-mature} rising) -> {OUT}")
