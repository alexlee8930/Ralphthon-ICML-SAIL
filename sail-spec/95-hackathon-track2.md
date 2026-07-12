# 95 · 해커톤 Track 2 프로토콜 (공식 킷 정제본)

의존: backend/60 (파이프라인), ops/81 (/score·/meta-review), 90-harness

출처: `github.com/team-attention/ralphthon-icml` (공식 이벤트 킷) — 우리에게 필요하고
바로 쓸 수 있는 것만 정제. 원본 킷의 Track 1/W&B/Codex 플러그인 트랙은 우리와 무관.

## 1. 공식 사실 (이벤트 킷 verbatim 근거)

- **Track 2 딜리버러블 = 2개**: ① 재사용 가능한 Review Agent를 **`review-agent.md`로
  동결한 아티팩트** ② 그 에이전트로 쓴 Track 1 논문의 ICML식 구조화 리뷰.
  둘 다 제출한다. Track 2는 **컴퓨트 프로비저닝 불요**가 공식 전제.
- 입력 논문: Track 1 템플릿 — Research Spec + Agent Workflow + **2–4쪽 short paper**
  (Abstract/Intro/Method/Experiments/Limitations) + **셀프리뷰 체크리스트**
  (수치→증거 추적, 베이스라인 공정성, 주장=결과, 부정적 결과 포함, 인용·분량 확인).
- 타임라인: Ralph Loop **12:30–15:30** → 사람 손질 15:30–16:30 → **하드컷 16:30** →
  이후 피어·셀프리뷰.
- **평가축 2개 (공식 슬라이드)**: ① **Agent 접근 방식(Approach quality)** — Track 2
  제출물은 **최대 4쪽 하드리밋** 문서이며 접근의 아이디어 자체가 심사됨
  ② **Judge ↔ Agent review 유사도** — 심사위원 리뷰와 우리 리뷰의 일치(점수 방향 +
  지적 내용 + 형태). 운영자 전언 기준으론 논문 10편에 대한 점수 상관도 여기 포함.
  주최측이 "빠른 claim → read → ICML-format post" 전용 가이드·테스트 환경 제공 예정 —
  **당일 그 가이드의 리뷰 형식이 §2 템플릿과 다르면 가이드가 우선**.
- 금지: 결과·인용·리뷰 날조 (우리 그라운딩 원칙과 동일).

## 2. 공식 리뷰 템플릿 (평가자가 기대하는 출력 형식 — verbatim)

```
## Paper and Evidence Identity
- Review Agent name/version: / review-agent.md path/hash: / Paper version/hash: / Evidence bundle reviewed:
## Summary
## Strengths
## Weaknesses
## Questions for the Authors
## Scores
- Soundness: / Presentation: / Contribution: / Overall recommendation: / Confidence:
  (각 점수마다 evidence-backed rationale 1개)
## Ethics and Limitations
## Evidence Trace
  (핵심 주장마다 논문 섹션·표·그림·저장 결과에 매핑. 검증 불가 항목은 플래그)
```

## 3. 우리 파이프라인 → 공식 템플릿 매핑

| 공식 필드 | 우리 소스 | 상태 |
|---|---|---|
| Summary/Strengths/Weaknesses/Questions | 리뷰어 헤드 판단 + 확장 body | ✅ 있음 |
| Soundness/Presentation/Contribution (1–4) | REVIEW_SCHEMA facet (backend/60) | ✅ 있음 |
| Confidence (1–5) | REVIEW_SCHEMA facet | ✅ 있음 |
| Overall recommendation | rating 1–10 + 점수헤드 score | ✅ 있음 |
| **Evidence Trace** | 그라운딩 원칙은 있으나 섹션 미출력 | ⚠️ `review-agent.md`가 렌더 시 생성 |
| Ethics and Limitations | 미출력 | ⚠️ 상동 |

→ 갭 2개는 **assets/review-agent.md**(제출 아티팩트)가 출력 단계에서 채운다 —
어댑터 수정 불요, 렌더링 프롬프트 소관.

## 4. "10편 상관 평가"에 대한 적합성 분석 (정직 버전)

**구조적으로 유리한 점**: 평가 지표가 상관(=순위)이므로 절대 눈금은 무관하다.
점수헤드가 4쪽 해커톤 논문에 죄다 10–30점을 줘도(ICML 눈금에선 전부 약한 논문이
맞으므로) **순위만 사람과 일치하면 만점**이다. 낙관 편향 걱정도 상관 평가에선 상쇄된다.

**진짜 리스크 1 — 좁은 밴드 변별력(range compression)**: 헤드의 Spearman 0.872는
품질 스펙트럼이 넓은 실학회 분포에서 잰 것. 비슷한 품질의 4쪽 논문 10편 안에서의
변별은 훨씬 어렵고, 1–99 clamp된 score는 바닥에서 해상도를 잃는다.
**처방(구현됨)**: `/score`가 주는 **연속값 `pred`(0–1, clamp 없음)로 순위를 매긴다** —
assets/hackathon_score.py가 score와 pred를 둘 다 기록하고 pred로 랭킹한다.
변별의 주동력은 리뷰(leave-one-out ±12)이므로, 3-리뷰어의 rating 분산이 살아있는지도
드라이런에서 확인한다.

**진짜 리스크 2 — 입력 분포**: 4쪽 논문 + 셀프리뷰 1개는 학습 분포(풀페이퍼+리뷰 3)와
다르다. abstract 경로는 문제없고(짧으면 Claude 생성 폴백), **셀프리뷰는 discussion
`{"who":"Authors"}`로 주입**하면 학습 형식과 정합 — 스크립트가 reply 엔드포인트로 처리.
**민감도 실측 (2026-07-12, 리뷰 고정 후 채널 격리)**: `/score` pred는 셀프리뷰
유무에 **바이트 동일**(구조상 discussion 미입력 — 순위 지표 완전 면역), 메타 헤드
p_accept는 두 논문 모두 Δmargin 정확히 −0.25로 **균일 소폭 하락**(순위 중립,
자화자찬 부스트 없음). → 셀프리뷰 주입은 안전, 기본 포함 유지.

**결론**: 포맷은 괜찮고, 승부처는 절대점수가 아니라 **10편 내 순위 변별력**.
아래 G6 드라이런으로 사전 검증하고, 순위 제출은 pred 기준으로.

## 5. G6 — 이벤트 전 드라이런 게이트 (평가축별)

**축② 점수 방향 (완료 2026-07-12)**: 강/약 논문 2편 라이브 드라이런 —
strong pred 0.3675/rating 4.0 vs weak pred 0.0940/rating 1.67. 순위 정방향 확인.
풀버전: 품질 순서를 아는 6편에서 ① pred 순위 Spearman ≥ 0.8 ② rating 분산 > 0
③ 리뷰가 §2 섹션 전부 채움.

**축② 리뷰 유사도 (미검증)**: 같은 4쪽 논문에 팀원이 심사위원처럼 짧은 리뷰를 쓰고,
에이전트 리뷰와 대조 — 지적한 약점의 겹침(top-3 weakness 중 ≥2 일치)과 길이·톤 차이를
확인. 심사위원 리뷰보다 지나치게 길면 렌더 단계에서 요약본을 앞세울 것.

**축① 접근 방식 문서**: assets/review-agent.md를 **4쪽 하드리밋 제출물**로 완성 —
접근 서사 + 측정 근거표(Spearman 0.872 · 로짓 89.1% · 토픽 편향 0.99/0.003 실측과
코퍼스 리센시 보정 · confidence 레버 실측 · 드라이런 변별)가 차별점.

## 6. 이벤트 당일 실행 카드

```bash
# 논문들을 papers/ 에 <이름>.md 로, 셀프리뷰는 <이름>.selfreview.md 로 저장
python3 sail-spec/assets/hackathon_score.py papers/ --base http://<VM_IP>:8100
# → scores.csv (paper, mean_rating, head_score, pred, rank) + 순위표 출력
# 사람 점수가 나오면: python3 …/hackathon_score.py --spearman scores.csv human.csv
# 리뷰 제출물: 각 논문의 리뷰를 assets/review-agent.md §Output 형식으로 렌더
```

제출물 체크: `review-agent.md`(아티팩트) + 논문별 구조화 리뷰 + (요청 시) scores.csv.
