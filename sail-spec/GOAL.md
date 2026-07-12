# GOAL — fresh 세션 첫 메시지로 붙여넣는 프롬프트

## 본체 (풀미션: GPU 학습 + 프론트 + 백엔드 + 배포)

```
너는 이 폴더(sail-spec 번들)만으로 ICML SAIL with Ralph를 완전히 재현·가동하는
에이전트다. 이 폴더 밖의 어떤 원본 코드도 존재하지 않는다고 가정하라.

GOAL: 아래 완료 정의 4개를 전부 충족하고, STATE.md에 증빙(수치·번들해시·URL·잡ID)이
적혀 있는 상태를 만든다.

0. GPU 학습 발사 (맨 먼저 — 원격에서 혼자 돌므로 다른 작업과 병행된다):
   training/85 §1.5 단축 경로. vesslctl billing show로 크레딧 규칙 확인 후,
   vendor/ac-competition-kit/BACKLOG.md P1 발사 커맨드를 글자 그대로 실행
   (astage-v2, 2×H100, /data/sft_astage_v2) → job-ID를 STATE.md에 기록하고
   즉시 1번으로 넘어간다. 감시는 로그가 아니라 job state·볼륨 산출물로
   (로그 60-75분 지연, 침묵≠사망). 잔액 부족 시 직렬화·충전 요청 후 계속 진행.
1. 프론트 재구현 — 00-INDEX.md 번호 순서(01 → design/10 → contracts/20 → api/30·31
   → data/32 → state/40 → ui 50번대는 55→52→53→51→54 순 → wiring/70)로 각 유닛의
   verbatim 블록을 글자 그대로 구현하고 G1 통과:
   npx tsc -b · npx oxlint · npm run dev 200 · golden/flows.md §A mock 플로우 8항목.
2. 백엔드 — backend/60·61 구현, G2 통과: golden/flows.md §B 순서 그대로 폴백 e2e
   (TestClient, finalize 후 score·metaReview·deficiency·decisionPost 존재).
3. 배포 — ops/80 런북 그대로 GCP 서빙, G3 통과: healthz live:"True" +
   새 번들 해시 서빙 + golden 6단계 curl 완주. (업로드가 reset보다 먼저!)
4. 학습 마무리 — 0의 잡이 끝나면 BACKLOG 평가 체인(연도제거 s5 → gen_icml_vllm t0.8
   → astage_s5_prep) 실행. 게이트(AUC ≥0.65 · ≤3점 비율 ≥10% · 하류 ≥0.79) 통과
   시에만 서빙 반영, 실패 시 어댑터 보존만. 크레딧 여유 시 P2(점수헤드 v21 리핏,
   commands.sh 블록 3 --adapter 변경, Spearman ≥0.85) → 이후 85 §3 연속학습 모드로
   전환해 운영자의 terminate 지시까지 체크포인트 보존·게이트 승격을 반복한다.
   금지(폐쇄 트랙): 가상 데이터 학습 · 길이지시 프롬프트 실험 · test_2023 전문 학습.

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

## 변형 2 — GPU 재학습 트랙 (단축 경로 기준)

```
training/85-gpu-plan.md가 GOAL이며, §1.5 단축 경로부터 시작한다 — 데이터와 검증
커맨드는 이미 준비되어 있으니 새로 만들지 마라. 커맨드 창작 금지: 발사·평가는
vendor/ac-competition-kit/BACKLOG.md와 vessl/commands.sh의 검증본을 글자 그대로,
막히면 kit CLAUDE.md 지뢰표부터 대조한다.

순서:
1. vesslctl billing show — §1.5 크레딧 발사 규칙 적용. 잔액이 (동시 잡 시간당 합계
   × ETA×1.5 + 서빙 $1.8/hr)에 못 미치면 잡을 직렬화하고 운영자에게 충전을 요청하되,
   그동안 가능한 무과금 작업을 먼저 진행한다.
2. P1 (최우선): kit BACKLOG P1 발사 커맨드 그대로 — astage-v2, 2×H100
   (resourcespec-ch100x2), 데이터 /data/sft_astage_v2, ~4.5h. 발사 즉시 STATE.md에
   job-ID·시각 기록. 감시는 로그가 아니라 job state·볼륨 산출물로 (로그 60-75분 지연,
   침묵≠사망, 타임아웃 전 임의 kill 금지).
3. P1 완료 → BACKLOG의 평가 체인(연도제거 s5 → gen_icml_vllm t0.8 → astage_s5_prep)
   → 게이트: AUC ≥0.65 · ≤3점 비율 ≥10% · 하류 ≥0.79. 통과 시에만 서빙 반영,
   실패 시 어댑터 보존만 하고 STATE에 기록.
4. 크레딧 여유 시 P2: commands.sh 블록 3을 --adapter /data/out/v21/final로 바꿔
   1×H100 발사. 게이트 Spearman ≥0.85 통과 시 SCORE_ADAPTER 교체 후 재기동.
5. 이후 85 §3 연속학습 모드: 체크포인트 보존, epoch마다 게이트 평가, 통과 시에만
   승격. 운영자의 terminate 지시까지 유지하고 승격 사이클마다 잔액을 STATE에 기록.

금지(폐쇄 트랙): 가상 데이터 학습 · 길이지시 프롬프트 실험 · test_2023 전문 학습.
매 액션 후 STATE.md 갱신 — GPU 학습 트랙 섹션의 빈칸(job-ID·수치)을 채워라.
```
