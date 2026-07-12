# GOAL — fresh 세션 첫 메시지로 붙여넣는 프롬프트

## 본체 (제품 풀 재현 — Ralph Loop 제출용)

```
너는 이 폴더(sail-spec 번들)만으로 ICML SAIL with Ralph를 완전히 재현·가동하는
에이전트다. 이 폴더 밖의 어떤 원본 코드도 존재하지 않는다고 가정하라.

GOAL: 아래 완료 정의를 전부 충족하고, STATE.md에 증빙(수치·번들해시·URL·잡ID)이
적혀 있는 상태를 만든다.

1. 프론트 재구현 — 00-INDEX.md 번호 순서(01 → design/10 → contracts/20 → api/30·31
   → data/32 → state/40 → ui 50번대는 55→52→53→51→54 순 → wiring/70)로 각 유닛의
   verbatim 블록을 글자 그대로 구현하고 G1 통과:
   npx tsc -b · npx oxlint · npm run dev 200 · golden/flows.md §A mock 플로우 8항목.
2. 백엔드 — backend/60·61 구현, G2 통과: golden/flows.md §B 순서 그대로 폴백 e2e
   (TestClient, finalize 후 score·metaReview·deficiency·decisionPost 존재).
3. 배포 — ops/80 런북 그대로 GCP 서빙, G3 통과: healthz live:"True" +
   새 번들 해시 서빙 + golden 6단계 curl 완주. (업로드가 reset보다 먼저!)

규칙:
- CLAUDE.md와 00-INDEX "0. 공통 원칙"이 절대 규칙이다. verbatim 창작·개선 금지,
  각 블록의 줄수 표기로 추출을 검증하라.
- 게이트를 통과하기 전에 다음 단계로 넘어가지 않는다. 실패 시 CLAUDE.md 실패
  규칙(지뢰표 대조 → 일시 오류 20초 재시도 → 문서의 폴백 경로, 3회 실패 시 스킵+기록).
- 사람에게 묻지 마라. 유일한 예외 = SECRETS.local.md 부재, gcloud/vesslctl
  브라우저 로그인, VESSL 크레딧 — 이때만 요청하고 그 외는 스스로 결정 후
  STATE.md 판단 로그에 사유를 남긴다.
- 매 액션 후 STATE.md 갱신. STATE에 없는 진행상황은 존재하지 않는 것과 같다.
- 작업이 끊기는 일이 없게 하라. 사용량 한도(5시간 세션·주간 한도 포함)에 다다를
  조짐(한도 경고 배너·rate limit 메시지)이 보이면: ① STATE.md를 즉시 최신화하고
  ② SECRETS.local.md의 ANTHROPIC_API_KEY로 폴백해 이어가라 —
  `export ANTHROPIC_API_KEY=<SECRETS.local.md의 키>; claude -c` 로 재기동하면
  구독 한도와 무관하게 API 과금으로 계속 돈다. 이 원라이너를 STATE.md 상단에
  미리 적어두고, 운영자가 있으면 실행을 요청하고 없으면 로그로 남겨라.
  보안은 신경 쓰지 않아도 된다(운영자 승인, 행사 후 로테이트 예정).

시작: STATE.md → 00-INDEX.md 정독 → 웨이브 0(01-foundation)부터.
```

## 변형 1 — 해커톤 당일 Track 2 수행 (제품이 이미 떠 있을 때)

```
95-hackathon-track2.md를 정독하고 §6 실행 카드를 수행하라. 당일 공식 가이드의
리뷰 형식이 §2 템플릿과 다르면 가이드가 우선이다. 논문들을 papers/에 모아
assets/hackathon_score.py로 채점하고(셀프리뷰는 .selfreview.md — 주입 기본 포함,
민감도 실측상 안전), 각 리뷰를 assets/review-agent.md §Output 형식으로 렌더하되
요약을 앞세워라(심사위원 리뷰 대비 길이 2배 이슈). 제출물 = review-agent.md(4쪽) +
논문별 구조화 리뷰. 사람 점수 공개 시 --spearman으로 상관을 계산해 STATE.md에 기록.
```

## 변형 2 — GPU 재학습 트랙

```
training/85-gpu-plan.md가 GOAL이다. vendor/ac-competition-kit/의 CLAUDE.md
지뢰표·vessl/commands.sh 검증본·watch_job.sh를 그대로 사용하라(커맨드 창작 금지).
사전 스테이징 P1~P6 → 스모크 30스텝 통과 후에만 본학습 발사 → 게이트 1·2 통과 시만
승격, 실패 시 v2 유지. 3시간 후에는 체크포인트 보존 연속학습으로 전환하고
운영자의 terminate 지시까지 유지하라. 크레딧을 승격 사이클마다 STATE.md에 기록.
```
