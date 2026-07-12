# ICML SAIL with Ralph — 운영 매뉴얼 (fresh 세션 진입점)

너의 임무: **이 폴더만으로 ICML SAIL with Ralph 전체를 재현·운영한다** — 프론트 SPA,
FastAPI 백엔드, GCP 서빙, VESSL 학습, 해커톤 Track 2 수행까지. 이 파일은 방법,
`00-INDEX.md`는 지도, `STATE.md`는 현재 위치다. 세션이 끊겨도 STATE.md만 읽으면
이어받을 수 있게 유지하라.

## 기동 순서 (새 세션마다)

1. `STATE.md` 읽기 — 어디까지 왔나. 처음이면 체크리스트 그대로 시작
2. `00-INDEX.md` 정독 — 공통 원칙 10개와 표준 지시문이 **절대 규칙**
3. `SECRETS.local.md` 존재 확인 — 없으면 운영자에게 요청 (없이는 LIVE·배포·학습 불가)
4. 임무 선택 (운영자가 지정하지 않았다면 STATE.md의 다음 미완 항목):
   - **제품 재구현** → 90-harness §1 프롬프트 그대로 수행 (01→…→70 → G1 → 60 → G2 → ops/80 → G3)
   - **GPU 학습** → training/85 (동반 하네스 `vendor/ac-competition-kit/` 사용 — 그쪽 CLAUDE.md의 지뢰표·커맨드 검증본이 우선)
   - **해커톤 Track 2** → `95-hackathon-track2.md` §6 실행 카드

## 절대 규칙 (00-INDEX 공통 원칙의 요약 — 충돌 시 00-INDEX가 우선)

- verbatim 블록은 글자 그대로. 창작·개선·리네이밍 금지. 줄수 표기로 추출 검증
- 커맨드는 이 번들의 검증본 복붙 — 새로 짓지 않는다. 새 에러만 새로 디버깅
- 검증 게이트(G1~G6)를 통과하기 전에는 다음 단계로 넘어가지 않는다
- 사람에게 묻지 마라. 실패 시: ①지뢰표(vendor kit CLAUDE.md) 대조 ②일시 오류 20초 재시도
  ③폴백 경로(각 문서에 명시) 전환. 같은 작업 3회 실패 시 스킵하고 STATE에 기록
- 매 액션 후 STATE.md 갱신. **STATE에 없는 진행상황은 존재하지 않는 것과 같다**

## 수동 개입이 필요한 유일한 지점 (미리 운영자에게 요청)

`gcloud auth login` · `vesslctl auth login` (둘 다 브라우저 OAuth) · VESSL 크레딧 충전.
그 외 전부 CLI로 무인 진행 가능하다.

## 폴더 지도

```
CLAUDE.md            ← 지금 이 파일
STATE.md             ← 살아있는 체크리스트 (매 액션 후 갱신)
00-INDEX.md          ← 시스템 지도·공통 원칙·표준 지시문·게이트
SECRETS.local.md     ← 평문 키 (git 제외 — 복사 시 반드시 동반)
01-foundation.md, design/, contracts/, api/, data/, state/, ui/, wiring/
                     ← 프론트 verbatim 유닛 (번호 = 빌드 순서)
backend/             ← 어댑터 verbatim + 리센시 데이터
ops/                 ← 80 GCP 런북 · 81 VESSL 연동
training/85          ← GPU 재학습 플랜 (3h + 연속학습)
95-hackathon-track2  ← 이벤트 프로토콜·평가축·실측 결과
90-harness.md        ← 표준 지시문·에이전트 분배·리허설
assets/              ← startup.sh · topic_maturity.json · review-agent.md ·
                       hackathon_score.py · package-lock.json
golden/              ← 라이브 실측 API 트랜스크립트 + 수동 체크리스트
vendor/ac-competition-kit/ ← 모델 재현 동반 하네스 (juneyoon — 지뢰표·commands.sh)
                              ※ SECRETS와 같이 git 제외(비공개 코드) — 클론본이면
                              github.com/juneyoon-sweetspot/ac-competition-kit 접근 요청
```
