# golden · 핵심 플로우 수동 확인 체크리스트

동봉된 `*.json`은 **라이브 서버 실측 트랜스크립트** (2026-07-12, LIVE 모드, VESSL v2 어댑터).
값(점수·문구)은 실행마다 다르다 — **필드·구조·불변식**이 대조 기준이다.

## A. mock 플로우 (G1 — 백엔드 없이)

1. `/review`에서 제목+본문 제출 → AgentWorkingCard가 step 이벤트를 스트리밍
   (thinking 이벤트는 LIVE 전용 — mock은 step만 낸다) → 리뷰 3건 도착.
   **이 시점에 점수가 어디에도 없어야 한다.**
2. 리뷰 카드: 평점 칩 + 요약. `body` 있으면 "Read full review" 토글.
3. 코멘트 말풍선의 Reply → 컴포저에 "Replying to Reviewer N · <section> ✕" 칩
   → 전송하면 해당 리뷰어가 응답.
4. Revise → 헝크 카드 allow/deny → 결정 로그가 컴포저에 프리필 + 우측 원고에
   하이라이트 + "Revised manuscript attached" 칩은 **다음 메시지에** 실림
   (스레드에 유령 메시지가 생기면 위반).
5. 원고 패널 연필 → 직접 편집·저장 → draft 갱신 (스레드 메시지 없음).
6. Finalize → 메타리뷰 + 점수 + 결정 + DeficiencyCard(다음 밴드·항목별 why/action).
7. Resubmit → 새 사이클: 리뷰 새로, 스레드 빈 상태, 이전 사이클은 읽기 전용.
8. 새로고침 → IndexedDB로 세션 유지. 사이드바 삭제 → ConfirmDialog → 소멸.

## B. 라이브 API 시퀀스 (G3 — *.json과 형태 대조)

| 순서 | 호출 | 대조 파일 | 확인 불변식 |
|---|---|---|---|
| 0 | GET /healthz | healthz.json | live:"True", contract:"v2-cycles" |
| 1 | POST /api/loop/papers | submit.json | cycles[0].reviews 3건(rating 1-10)·comments 존재·thread는 빈 배열·**score 없음** |
| 2 | POST …/reply | reply.json | 작성자 메시지 + 대상 리뷰어 응답이 thread 끝에 |
| 3 | POST …/revision-draft | revision-draft.json | pendingRevision.hunks[] (before가 원고의 substring) |
| 4 | POST …/revision-apply | revision-apply.json | draftManuscript + revisionNote 생성, pendingRevision.hunks[]에 decision 기록(소거 아님) |
| 5 | POST …/finalize | finalize.json | metaReview·score{score,gradeTier,attributions,layers}·decision·deficiency·decisionPost |
| 6 | POST …/resubmit | resubmit.json | cycles 길이+1, 새 사이클 manuscript==이전 draft, reviews 3건 새로 도착, thread는 빈 배열 |

## C. 불변식 (모드 무관)

- score/decision/deficiency는 finalize 이후에만 존재.
- reviews[].reviewer는 "Reviewer 1..3" — 익명 핸들 없음.
- placeholder 원고(한 줄 인사말 등) → 헝크 0 (그라운딩). rating 1 강등은 LIVE 한정
  (mock·폴백 리뷰는 고정 시드 4/5/4를 쓴다).
- 사이클 간 컨텍스트 누수 없음: resubmit 후 새 리뷰가 이전 스레드를 인용하지 않음.
