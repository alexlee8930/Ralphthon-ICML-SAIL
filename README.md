# ICML SAIL with Ralph

Frontend for **ICML SAIL with Ralph** — an AC(Area Chair)-style paper-review
agent. Submit a paper, get a 0–100 selection score from the 3-head model,
receive an AC-style review when the score falls short of the award-similar
band, revise with one click, and loop until **SELECTED**.

The UI is a pixel-faithful web port of the MIT-licensed
[Open Science Desktop](https://github.com/ai4s-research/open-science)
(design tokens, layout constants, interaction patterns) — see
`LICENSES/open-science-MIT.txt`.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS — paper-tone light/dark themes, alpha-capable `color-mix` tokens |
| UI state | **Recoil** (sidebar/inspector widths, theme, manuscript highlight) |
| Server state | **TanStack Query** (papers, versions, scores, reviews) |
| Routing | react-router-dom |
| Icons / primitives | lucide-react, Radix UI |
| Local persistence | **IndexedDB** (mock mode) |

## Run

```bash
npm install
npm run dev        # http://localhost:5199 — standalone on the built-in mock
```

Connect the real agent API later with one env var (the mock is bypassed):

```bash
echo 'VITE_RALPH_API_URL=http://localhost:8100' > .env.local   # 8000은 로컬 Sophy와 충돌
```

### 실 어댑터 연결 메모 (2026-07-11, 백엔드 어댑터 v1 기준)

- GCP 배포본: `http://8.230.3.211:8100` (GCE `sail-adapter` VM, `sweetspot-ax` /
  asia-northeast3-a, systemd `sail-adapter.service`, 상태 `/opt/sail/sail_state.json`).
  `VITE_RALPH_API_URL=http://8.230.3.211:8100` 로 바로 연결 가능.
- 어댑터: `icml-ac/serve/sail_adapter.py` (로컬 :8100) — 5개 엔드포인트 계약 전부 구현,
  CORS 허용, `sail_state.json` 영속. **실 파이프라인 연결 완료**: Claude 리뷰어 3인 병렬
  (few-shot 스킬, 미서빙 헤드 대체) → VESSL v2 LoRA 메타리뷰+p_accept
  (`/meta-review`, 반론 히스토리는 `discussion`으로 전달) → 점수 = p_accept×100에
  양극단 완화 캘리브레이션(p^0.25) → Claude attribution 헤드(원문 verbatim 근거) →
  Claude revise 에이전트(원고 실제 재작성). 헤드별 독립 폴백(결정적 시뮬레이션).
- SELECT 규칙: 점수 ≥ 88 **그리고** 리뷰 턴 ≥ 5 (메타리뷰 없이 선정하지 않음).
  SELECTED 이후에도 리뷰·수정 루프는 계속 (베스트페이퍼 밴드까지 피드백 지속).
- 제출 지연 ~20-40초, AI 수정 ~2-3분 (scoring 상태로 커버).
- **PDF 제출은 서버에서 텍스트 추출되어 `manuscript.kind: "text"`로 반환** (계약 상세는
  `src/api/reviewLoop.ts` 모듈 헤더가 단일 기준) — PDF embed가 필요해지면 PDF 서빙
  엔드포인트(GET .../versions/:v/pdf 등) 계약을 정해서 알려주세요.
- `score.attributions`는 v1에선 근사(코멘트 키워드→원고 문장 매칭), `layers`는 점수 연동
  근사값. 점수 캘리브레이션(양극단 완화)은 백엔드 후속 작업.

---

## Repository structure

```
src/
├── main.tsx                      RecoilRoot + QueryClient + Router + Theme
├── index.css                     design tokens (light/dark CSS variables)
├── data/
│   └── corpusDistribution.ts     REAL corpus histogram — 47,209 submissions
├── api/
│   ├── reviewLoop.ts             ★ domain contract + mock simulation
│   ├── reviewLoopQueries.ts      TanStack Query hooks (useLoopPaper, …)
│   └── loopStorage.ts            IndexedDB persistence (mock mode)
├── app/
│   ├── router.tsx                /review · /review/:id · /review/:id/analysis · /settings
│   ├── layout/AppShell.tsx       sidebar + outlet shell (⌘B collapse)
│   ├── providers/ThemeProvider.tsx
│   └── routes/
│       ├── ReviewLoopPage.tsx    ★ submit view + loop view (score/review/actions)
│       ├── AnalysisPage.tsx      ★ bottleneck viz + corpus distribution
│       ├── SettingsPage.tsx
│       └── NotFound.tsx
├── components/
│   ├── review/ManuscriptPane.tsx 우측 원고 패널 (text serif 렌더 / PDF embed, 하이라이트)
│   ├── analysis/
│   │   ├── BottleneckDiagram.tsx 백본 12블록 → 점수 병목 → 3-헤드 SVG
│   │   ├── CorpusDistribution.tsx 실코퍼스 히스토그램 + 내 논문 여정
│   │   └── ReviewTabs.tsx        Review | Analysis 탭
│   ├── sidebar/                  브랜드 락업 + New review + REVIEWS 히스토리
│   ├── settings/                 설정 카드
│   └── ui/                       Toaster, ConfirmDialog
└── lib/                          cn, Recoil store, platform shim, toast bus
```

## Features

1. **제출** (`/review`) — 제목 + 원고(**텍스트 붙여넣기 또는 PDF 업로드**, 둘 다 가능).
   모델 입력은 본문 텍스트이므로 PDF는 백엔드에서 텍스트 추출.
2. **채점** — 3-헤드 모델의 선택도 점수 **0–100** (100 = 만점). 점수 바에
   select 임계선(≥ 88, 수상작-유사 밴드) 표시.
3. **SELECT 판정** — 임계값 도달 시 SELECTED 배너 표시. 단 **루프는 종료되지
   않음**: 선정/베스트페이퍼 밴드에서도 리뷰·코멘트가 계속 생성되고 AI 수정을
   계속 돌릴 수 있음 (SELECTED는 상태이지 종착점이 아님).
4. **AC 리뷰** — 미달 시 버전당 6–7건의 이슈형 코멘트(major/minor/question,
   섹션 라벨). 다음 버전이 해소하면 `resolved in v(n+1)` 취소선 처리.
5. **AI 수정 루프** — "Revise with AI" 클릭 → 에이전트가 열린 리뷰를 반영해
   v(n+1) 생성 → 자동 재채점 → 반복. 버전 레일(v1 64 → v2 78 → v3 91✓)로
   전체 여정 탐색.
6. **원고 패널** — 각 버전이 채점 당시의 원고 스냅샷 보유. 텍스트는 세리프
   조판(마크다운 헤딩 지원). PDF 인라인 embed + "Open in new tab"은 PDF URL이
   있을 때(mock 또는 향후 PDF 서빙 엔드포인트) — 실 어댑터 v1은 추출 텍스트로
   표시. 360–960px 드래그 리사이즈.
7. **근거 하이라이트** — 기여도(feature attribution) 행 호버 → 그 피처를
   유발한 원고 문장이 패널에서 하이라이트 + 자동 스크롤 (S6 설명가능성의 UI).
8. **Analysis 탭** — ① 점수 병목 시각화: 백본 12블록 활성 → 8번 블록의
   softmax 병목(점수) → 3-헤드(리뷰/종합/판정) SVG 다이어그램. ② 실코퍼스
   분포: **실제 47,209편**의 선택도 히스토그램(√스케일) 위에 실측 티어
   중앙값(reject 25 / poster 43 / spotlight 59 / oral 71.8 / top-5% 86.7),
   select 밴드, 내 논문의 버전별 이동 경로.
9. **사이드바 REVIEWS** — 축적된 제출 히스토리(상태 점 + 점수). 라이트/다크
   테마, ⌘B 사이드바 접기.

---

## 데이터 저장 형태

### 1) 도메인 모델 (프론트·백엔드 공용 계약 — `src/api/reviewLoop.ts`)

리뷰는 채팅형 타임라인이 아니라 **버전에 귀속**됩니다. 논문 1건의 전체 상태:

```jsonc
{
  "id": "lp_1",
  "title": "…",
  "status": "in_review",            // scoring | in_review | selected
  "currentVersion": 2,
  "versions": [
    {
      "version": 1,
      "origin": "upload",            // upload | ai_revision
      "changeNote": "…",             // ai_revision일 때: 무엇을 고쳤는지
      "manuscript": {                // ★ 이 버전이 채점된 원고 스냅샷
        "kind": "text" | "pdf",
        "text": "…",                 // text: 전문 / pdf: 누적 수정 노트
        "fileName": "paper.pdf",     // pdf 전용
        "url": "blob:…"              // pdf 전용 (로드 시 재발급)
      },
      "score": {
        "score": 64,                 // 0–100
        "selectThreshold": 88,
        "gradeTier": "poster",       // reject|poster|spotlight|oral|notable-top-5%
        "attributions": [            // S6: 점수를 움직인 피처 + 근거 문장
          { "feature": "ablation completeness", "weight": -0.31,
            "evidence": ["원고의 실제 문장…"] }
        ],
        "layers": [0.28, …]          // 백본 12블록 활성 (병목 시각화용)
      },
      "reviews": [                   // S1 리뷰 헤드: 병렬 리뷰어 3인의 리뷰
        { "id": "lp_1_v1_r0", "reviewer": "Reviewer 1",
          "rating": 5, "summary": "…" }
      ],
      "metaReview": "…",             // S3 메타리뷰 헤드: 리뷰·반론 히스토리 종합 (v5부터)
      "comments": [                  // ★ 메타리뷰에서 추출한 구조화 코멘트 (select면 [])
        { "id": "lp_1_v1_c0", "version": 1,
          "severity": "major",       // major | minor | question
          "section": "Method",
          "body": "…",
          "resolvedInVersion": 2 }   // 해소는 삭제가 아니라 마킹 → 히스토리 보존
      ]
    }
  ]
}
```

### 2) 로컬 실행 시 물리 저장소 — IndexedDB (`src/api/loopStorage.ts`)

- DB `sail-ralph` / object store `papers` (keyPath `paper.id`).
- 저장 단위: `{ paper: LoopPaper, pdfBlobs: {버전: Blob} }` — 위 JSON 전체
  + 업로드된 **PDF 원본 Blob**.
- 제출/수정 때마다 저장, 앱 시작 시 하이드레이션으로 복원 → **새로고침·재부팅
  후에도 히스토리 유지**. 사이드바 REVIEWS와 `/review` Submissions 목록이
  과거 기록 진입점.
- object URL은 세션 한정이라 저장 시 제거하고 로드 때 Blob에서 재발급.
- 용량: IndexedDB는 수백 MB급이라 전문·PDF 축적에 충분 (localStorage 5MB
  한계 때문에 채택하지 않음). 시크릿 모드 등 저장 불가 환경에선 메모리로
  우아하게 강등.

### 3) 실 API 연결 후 — 백엔드가 저장 소유

`VITE_RALPH_API_URL` 설정 시 IndexedDB를 건너뛰고 아래 계약으로 통신.
관계형 매핑: `papers`(1) ← `versions`(N, manuscript·score·layers 포함) ←
`comments`(N, `resolved_in_version` nullable).

| Method | Path | 역할 |
|---|---|---|
| POST | `/api/loop/papers` | 제출 (multipart: title, text?/file?) → v1 채점(+미달 시 리뷰) |
| GET | `/api/loop/papers` | 제출 목록 |
| GET | `/api/loop/papers/:id` | 루프 전체 상태 (위 JSON) |
| POST | `/api/loop/papers/:id/revise` | AI 수정 → 새 버전 + 재채점 + 재리뷰 |
| POST | `/api/loop/papers/:id/versions` | 수동 수정본 업로드 (multipart) |

### 4) 실코퍼스 통계 (`src/data/corpusDistribution.ts`)

Analysis 히스토그램은 목이 아니라 **실데이터**: 학습 코퍼스 `train_pairs.csv`
(ICLR/ICML/NeurIPS/UAI 2018–2026, 47,209편)의 `selectivity_target × 100`
분포를 50개 bin으로 구운 상수 + 등급 티어별 실측 중앙값.

---

## 모의(mock) 동작 규칙

백엔드 없이도 전체 플로우가 돌도록: 점수 궤적 v1 63 → 69 → 74 → 79 → 84 →
v6 91(select). 리뷰(리뷰어 3인)와 점수는 매 버전 생성되지만, **메타리뷰는 반론
히스토리가 필요하므로 리뷰 턴 5회 축적 후(v5부터)** 실제 루프 기록(제기/해소된
이슈 수, AI 수정 내역, 점수 궤적)을 종합해 생성. 리뷰 코멘트는 라운드별
템플릿(회차가 갈수록 좁아짐), AI 수정은 원고에 "Revision notes (vN)" 섹션을
덧붙여 버전 간 차이가 보이게 함. 근거 문장은 제출한 원고에서 피처별 키워드로
실추출.
