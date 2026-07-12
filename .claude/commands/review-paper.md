---
description: 논문 파일을 SAIL 풀 파이프라인(웹과 동일 경로)으로 리뷰 — 공식 Track-2 형식 출력
---

$ARGUMENTS 로 주어진 논문 파일(들)을 SAIL 리뷰 파이프라인에 통과시켜라.

실행 (파일별로):
```bash
python3 sail-spec/assets/review_paper.py "<파일경로>"
```

- 이 스크립트는 웹 제품과 **완전히 같은 백엔드 경로**를 탄다: Opus 리뷰어 3인 →
  ICML 분량 reasoning 확장 → 초록 자동 생성(없을 때) → 코퍼스 리센시 보정 →
  (셀프리뷰 `<stem>.selfreview.md` 존재 시 Authors 턴 주입) → AC 메타리뷰 +
  캘리브레이션 점수 → 공식 Track-2 템플릿 렌더 → `<stem>.review.md`
- 여러 파일이면 순차 실행 (백엔드 리뷰어가 병렬이라 파일당 ~3-4분).
- 완료 후: 점수 요약 표(파일·rating·score·S/P/C·decision)를 보여주고,
  review.md 중 1건의 Summary/Scores 섹션을 인용해 품질을 확인시켜라.
- 서버 세션은 기본 삭제된다(--keep으로 보존). API 키는 sail-spec/SECRETS.local.md에서
  자동 로드된다.
