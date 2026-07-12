# STATE — 살아있는 체크리스트 (매 액션 후 갱신)

## 현재 단계: 미시작 (fresh 세션 — CLAUDE.md부터)

## 제품 재구현 트랙 (G1→G3)
- [ ] 환경: Node ≥20 / Python ≥3.10 / SECRETS.local.md 확인
- [ ] 웨이브 0: 01→10→20→30 + npm install (tsc는 첫 src 파일 후부터)
- [ ] 웨이브 1: 31·32·40 / 55→50 / 52→53→51→54 → wiring/70 → 일괄 tsc -b
- [ ] G1: tsc -b · oxlint · dev 200 · mock 플로우 8항목 (golden/flows.md §A)
- [ ] backend/60·61 → G2: 폴백 e2e (flows.md §B 순서, TestClient)
- [ ] ops/80: gcloud 로그인(수동) → §2 최초생성 or §3 배포루프 → G3: healthz live:"True" + golden 6단계
- [ ] 검증: 번들 해시 서빙 확인 (업로드가 reset보다 먼저!)

## GPU 학습 트랙 (G4 — vendor kit 병용)
- [ ] vesslctl 로그인(수동) + billing show (연속학습이면 $300+)
- [ ] 사전 스테이징 P1~P6 (training/85 §1 — P3 리젝 수집이 최장, 최우선 시작)
- [ ] 스모크 30스텝 통과 (본학습 발사는 그 후에만)
- [ ] JOB-A/B/C 발사 (job-ID: ______) → 게이트 1·2 → 승격 or 롤백
- [ ] 연속학습 전환 (체크포인트 경로: ______) / 중지 시각·사유: ______

## 해커톤 Track 2 트랙 (95 §6)
- [ ] 당일 공식 가이드 형식 확인 (§2 템플릿과 다르면 가이드 우선)
- [ ] papers/ 수집 → hackathon_score.py → scores.csv
- [ ] 리뷰를 review-agent.md §Output 형식으로 렌더 (요약 선행 — 길이 2배 이슈)
- [ ] 제출: review-agent.md(4쪽) + 구조화 리뷰 (+scores.csv)
- [ ] 사람 점수 공개 시 --spearman 상관 계산: ______

## 판단 로그
(형식: HH:MM 결정 — 사유)

## 진행 중 잡/작업
(형식: ID | 이름 | 시작 | 예상완료 | 완료 시 후속)
