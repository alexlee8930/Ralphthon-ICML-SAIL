# ICML SAIL with Ralph — 시스템 명세 (모듈 분해)

이 문서 묶음은 **아무것도 없는 폴더에서 ICML SAIL with Ralph 전체 프로덕트(프론트 + 백엔드 +
GCP 서빙 + VESSL 학습 파이프라인)를 픽셀/바이트 단위로 동일하게 재구현**하기 위한 명세다.
각 `.md`는 한 단위를 다루며, 그 단위만 맡은 에이전트가 다른 파일을 안 보고도 구현할 수 있게
자기완결적으로 기술한다. 렌더링·동작을 좌우하는 코드는 전부 verbatim 블록으로 박제했다.

ICML SAIL with Ralph는 **AC(Area Chair)식 논문 리뷰 에이전트 콘솔**이다
(Vite + React 19 + TS + Tailwind 3 + recoil/react-query SPA · FastAPI 단일파일 백엔드 ·
VESSL 서빙 Qwen3-8B LoRA 메타/점수 헤드 · Claude claude-opus-4-8 리뷰어/수정 에이전트).
논문을 제출하면 리뷰어 3인이 리뷰를 달고, 채팅형 리버탈 스레드에서 코멘트별 답글·AI 수정
헝크 allow/deny·원고 직접 편집을 주고받다가, finalize 때만 AC 메타리뷰 + 점수 + 결정 +
부족점(deficiency) 리포트가 나온다. resubmit은 fresh context로 새 사이클을 연다(실제 ICML과
동일). 우측에는 원고가 아티팩트 패널로 떠 있고 AI 수정부가 하이라이트된다.

---

## 0. 공통 원칙 (모든 단위에 적용)

1. **단일 타입 계약**: `src/api/reviewLoop.ts`의 타입이 프론트↔백엔드의 유일한 계약.
   항상 `import type { … } from "@/api/reviewLoop"`. 재정의 금지. 백엔드 JSON은 이 타입과
   1:1 (mock과 live는 형태가 완전히 같다 — UI는 둘을 구분하지 않는다).
2. **verbatim 절대주의**: 이 스펙의 4-백틱 코드 블록은 **글자 그대로** 산출 파일이 된다.
   창의적 변경·구조 개선·리네이밍 금지. 숫자(시드 데이터·임계값·지연 ms)도 바꾸지 않는다.
3. **디자인 토큰만**: 색·치수·폰트는 `src/index.css`의 CSS 변수와 tailwind.config.js의
   시맨틱 토큰(surface·accent·ok·warn·muted·faint·border·series-1..8)으로만. hex 하드코딩 금지.
   Tailwind className 조합은 스펙에 적힌 그대로 사용.
4. **경로 별칭**: `@/*` = `src/*`. **새 패키지 추가 금지** — package.json verbatim 고정.
   폰트는 @fontsource 셀프호스팅(외부 fetch 없음).
5. **모델/API 규칙**: 백엔드 Claude 호출은 `claude-opus-4-8` 고정, adaptive thinking
   (`display:"summarized"`) 스트리밍, structured outputs(`output_config.format=json_schema`).
   temperature/top_p 사용 금지. VESSL 메타 헤드 호출은 **서버가 프롬프트를 소유**하므로
   클라이언트는 reviews 문자열 배열·abstract·discussion `[{who,text}]`만 보낸다 (backend/60).
6. **두 실행 모드**: `ANTHROPIC_API_KEY` 없으면 모든 헤드가 결정적 폴백으로 강등(LIVE=False),
   있으면 LIVE. 각 헤드는 독립적으로 강등된다 — 한 헤드 실패가 파이프라인을 죽이지 않는다.
7. **점수는 메타리뷰와 함께만 존재**: finalize 전에 score를 만들거나 노출하는 코드는 계약 위반.
   SELECT_THRESHOLD = 88. 점수 캘리브레이션은 backend/60의 공식 그대로.
8. **그라운딩**: 리뷰·수정 에이전트는 원고에 없는 실험/결과를 날조하지 않는다. placeholder
   원고(예: "안녕하세요" 한 줄)는 헝크 0개·rating 1. 짧아도 진짜 초록이면 리뷰 가능(2-4점).
9. **UI 카피는 영어**, 스펙에 적힌 문구 그대로 (마이크로카피가 제품 톤의 일부).
10. **시크릿**: 이 번들의 90-harness에 키가 평문으로 박제되어 있다(운영자 승인 완료).
    코드에는 하드코딩하지 않고 환경변수/메타데이터로 주입한다.

---

## 1. 레이어(의존 구조)

```
 01 토대 ─┬─ 10 디자인 ──────────────┐
          ├─ 20 계약(HTTP·스토리지) ──┤
          │    └─ 30 reviewLoop ──┬───┼─ 50번대 UI ─┐
          │         ├─ 31 쿼리훅 ─┘   │             ├─ 70 와이어링 → (프론트 완성)
          │         └─ 32 코퍼스 ─────┘             │
          └─ 40 lib(store·toast) ───────────────────┘
 60 백엔드 어댑터 ── 61 리센시 데이터        (20의 HTTP 계약을 구현; 프론트와 독립 빌드)
 80 GCP 배포 ← (프론트 dist + 60 + 61 산출물)
 81 VESSL 연동 ← 60이 호출하는 서빙의 계약·운영
 85 GPU 학습 플랜 ← 81 위에서 실행 (제품과 독립, 어댑터 스왑으로 합류)
 90 하네스 ← 전체를 조립·검증하는 지시문과 에이전트 분배
```

---

## 2. 단위 목록

| 단위 | 다루는 범위 |
|---|---|
| `01-foundation.md` | package.json·vite·tsconfig×3·tailwind·postcss·index.html·.env.example·public SVG (verbatim) |
| `design/10-tokens.md` | src/index.css 전문 verbatim + 디자인 규칙 |
| `contracts/20-types.md` | HTTP API 계약표(v2-cycles) + loopStorage.ts(IndexedDB) verbatim |
| `api/30-review-loop.md` | reviewLoop.ts 전문 — 타입 계약·mock 시뮬레이터·live 클라이언트·잡 |
| `api/31-queries.md` | reviewLoopQueries.ts — react-query 훅·useAgentJob(700ms 폴링) |
| `data/32-corpus.md` | corpusDistribution.ts — 실측 코퍼스 히스토그램 |
| `state/40-lib.md` | lib/cn·store·platform·toast |
| `ui/50-sidebar.md` | Sidebar·StatusPills |
| `ui/51-review-loop-page.md` | ReviewLoopPage — 제출·채팅 스레드·에이전트 스트리밍·컴포저 |
| `ui/52-manuscript-pane.md` | ManuscriptPane — 아티팩트 원고·SVG figure·하이라이트·직접 편집 |
| `ui/53-analysis.md` | AnalysisPage·BottleneckDiagram·CorpusDistribution·ReviewTabs |
| `ui/54-settings.md` | SettingsPage + settings 카드 3종 |
| `ui/55-primitives.md` | ConfirmDialog·Toaster·NotFound |
| `wiring/70-wiring.md` | main·router·AppShell·ThemeProvider |
| `backend/60-adapter.md` | serve/sail_adapter.py 전문 + requirements — 4-헤드 오케스트레이션 |
| `backend/61-recency-data.md` | topic_maturity 빌더 스크립트 (산출물은 assets/에 동봉) |
| `ops/80-gcp-deploy.md` | gcloud 셋업 → 새 VM 프로비저닝(무SSH) → 배포 루프 → 검증 |
| `ops/81-vessl-serving.md` | vesslctl·서빙 API 계약(/meta-review)·Jupyter API·HF 데이터셋 지도 |
| `training/85-gpu-plan.md` | 3시간 재학습 플랜 + 무기한 체크포인트 연속학습 + 평가 게이트 |
| `90-harness.md` | 표준 지시문·에이전트 분배·시크릿·리허설 프로토콜·보조 명령 |
| `assets/topic_maturity.json` | 리센시 보정 테이블 (1,872 용어, 재생성 불필요 — 그대로 배포) |
| `assets/build_topic_maturity.py` | 위 테이블 빌더 (코퍼스 갱신 시에만) |
| `assets/startup.sh` | GCE startup-script (ops/80이 사용) |
| `golden/*.json` | 라이브 서버 실측 API 트랜스크립트 (submit→…→resubmit 6단계) |
| `golden/flows.md` | 핵심 플로우 수동 확인 체크리스트 |

---

## 3. 각 단위에 주는 표준 지시문

```
첨부된 단위 명세(.md)만 보고 명시된 산출 파일을 정확히 구현한다. 원칙:
- 00-INDEX의 "0. 공통 원칙"을 항상 지킨다(타입계약·verbatim·토큰·경로별칭·모델규칙).
- 명세에 4-백틱 코드 블록(verbatim)이 있으면 그 내용을 글자 그대로 사용한다.
- import는 @/api/reviewLoop 등 별칭 사용. 명세에 적힌 의존성 외 새 패키지 추가 금지.
- 산출 파일 경로/이름을 명세 그대로 따른다.
- 프론트 단위가 끝날 때마다 npx tsc -b로 타입 오류를 그 자리에서 잡고 다음 단위로.
- 백엔드 단위는 python -m py_compile serve/sail_adapter.py로 구문 확인.
```

---

## 4. 검증 게이트

### G1 — 프론트 (모든 50·70번대 후)
- `npx tsc -b` 통과 · `npx oxlint` 통과 · `npm run dev` → `/review` 200.
- mock 플로우: 제출(제목+본문) → 리뷰 3건 도착 → Reply 칩 답글 → Revise(헝크 allow/deny →
  컴포저 프리필 확인) → Finalize → 점수·메타리뷰·Deficiency 카드 → Resubmit → 새 사이클.
- IndexedDB 영속: 새로고침 후 세션 유지, 사이드바 삭제 동작.

### G2 — 백엔드 (60 이후, 프론트와 독립)
- 키 없이(폴백): TestClient로 submit→reply→finalize→resubmit e2e — score·metaReview·
  deficiency·decisionPost 존재. 상태 파일 재기동 후 유지.
- 키 있으면(LIVE): golden/*.json과 형태 대조 (값은 다를 수 있음 — 구조·필드가 기준).

### G3 — 통합/배포 (80 이후)
- 빌드: `VITE_RALPH_API_URL=http://<VM_IP>:8100 npm run build` → dist를 web.tar.gz로.
- **GCS 업로드 완료 확인 후** VM reset (순서 바꾸면 이전 번들 서빙 레이스).
- `http://<VM_IP>:8100/healthz` → `{"live":"True","contract":"v2-cycles"}` + 새 번들 해시 서빙.
- golden 6단계 curl 시퀀스 1회 완주.

### G4 — 학습 (85, 제품과 독립 게이트)
- training/85의 게이트 1~5 (리젝 평점·balanced acc·토픽 A/B·confidence·저티어 학회 테스트).
