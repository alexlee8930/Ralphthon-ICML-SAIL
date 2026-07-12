# 32 · 코퍼스 분포 데이터

의존: 없음 (독립 데이터)

산출 파일:

- `src/data/corpusDistribution.ts`

---

Analysis 화면의 실측 코퍼스 히스토그램·백분위 데이터. 실제 OpenReview
코퍼스에서 뽑은 수치를 박제한 것이므로 **숫자 그대로** 사용.


---

### 파일: `src/data/corpusDistribution.ts` (68줄) — **verbatim, 글자 그대로 사용**

````ts
/**
 * Real corpus distribution — computed from train_pairs.csv (icml_ac_transfer),
 * 47,209 ICLR/ICML/NeurIPS/UAI submissions, 2018-2026.
 * x = selection score (selectivity_target x 100), 50 bins of width 2.
 */
export const CORPUS_DISTRIBUTION = {
  "total": 47209,
  "binWidth": 2,
  "bins": [
    75,
    9,
    113,
    42,
    220,
    105,
    448,
    225,
    424,
    958,
    327,
    741,
    1150,
    1153,
    2798,
    2773,
    2229,
    1947,
    2373,
    1699,
    5466,
    4906,
    2639,
    5062,
    2157,
    1690,
    1359,
    410,
    568,
    312,
    627,
    855,
    148,
    275,
    144,
    150,
    200,
    68,
    230,
    28,
    26,
    30,
    2,
    34,
    2,
    9,
    2,
    1,
    0,
    0
  ],
  "tierMedians": {
    "reject": 25.0,
    "poster": 43.0,
    "spotlight": 59.0,
    "oral": 71.8,
    "notable-top-5%": 86.7
  }
} as const;
````
