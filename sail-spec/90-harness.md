# 90 · 하네스 — 표준 지시문 · 에이전트 분배 · 시크릿 · 리허설

의존: 00-INDEX (공통 원칙·검증 게이트)

## 1. 재구현 프롬프트 — Ralph Loop 제출용 (이게 본체)

```
./sail-spec/00-INDEX.md 를 먼저 정독하라. 거기 적힌 "공통 원칙"과 "표준 지시문"이
이 작업 전체의 절대 규칙이다.

그다음 번호 순서(01-foundation → design/10 → contracts/20 → api/30·31 → data/32
→ state/40 → ui/50~55 → wiring/70)로 각 단위 스펙을 읽고, 명시된 산출 파일을
정확히 구현하라. 프론트가 G1을 통과하면 backend/60·61을 구현해 G2를 통과시키고,
ops/80 런북대로 배포해 G3까지 완주하라. training/85는 별도 트랙(G4)이다.

단위별 규칙:
- 스펙에 없는 창의적 변경·구조 개선 금지. verbatim 코드 블록은 글자 그대로 사용.
- 산출 파일의 경로와 이름은 스펙 그대로. 스펙에 명시된 것 외 새 패키지 설치 금지.
- 한 단위가 끝날 때마다 npx tsc -b 로 타입 오류를 그 자리에서 잡고 다음 단위로.
- 검증 게이트(G1~G3)를 통과할 때까지 반복하고, 통과 전에는 다음 단계로 넘어가지 않는다.
```

## 2. 에이전트 분배 전략 (Ralph Loop 멀티에이전트 모드)

스펙이 verbatim이라 **단일 세션 순차 구현으로도 충분히 빠르다** (파일 실체화가 대부분).
병렬화가 허용되면 아래 3-웨이브가 최적 — 웨이브 내부는 완전 독립이라 충돌이 없다:

```
웨이브 0 (1 에이전트, 직렬 — 뿌리라서 나누면 안 됨):
  01-foundation → design/10 → contracts/20 → api/30 → npm install + tsc -b

웨이브 1 (3 에이전트 병렬):
  A: api/31 + data/32 + state/40        B: ui/55 + ui/50 (55 먼저 — 50이 ConfirmDialog 사용)
  C: ui/52 + ui/53 + ui/51 + ui/54 (51↔53 상호 참조라 반드시 한 에이전트가 이 순서로)
  tsc -b는 자기 담당 파일이 전부 생긴 뒤에만 의미가 있다 — B·C는 담당 완료 후 실행,
  교차 참조(50→55, 51→52/53)가 남는 최종 검증은 전원 완료 후 1명이 wiring/70과 함께
  일괄 tsc -b → G1 게이트.

웨이브 2 (3 에이전트 병렬, 웨이브 0 이후 언제든):
  E: backend/60 + 61 → G2               F: ops/80 배포 준비(gcloud 셋업·버킷)
  G: training/85 사전 스테이징 P3~P6 (가장 긴 작업 — 최우선 시작)

머지 규칙: 파일 소유가 단위별로 겹치지 않으므로 머지 충돌은 정의상 없다.
G1+G2 통과 → F가 G3 배포 → G가 GPU 창 런치.
```

오케스트레이터 수칙: ① 웨이브 0을 절대 병렬화하지 말 것(공통 원칙 어긋남의 근원)
② 각 에이전트에 해당 .md와 00-INDEX만 줄 것(다른 파일 열람 금지 — 자기완결성 검증 겸용)
③ 게이트 실패 시 해당 단위만 "보조 명령 §4"로 재굽기.

## 3. 시크릿·환경

**평문 키는 `sail-spec/SECRETS.local.md`에 있다** (GitHub push protection 때문에 그 파일만
gitignore — 번들을 복사할 때 반드시 같이 가져갈 것. 행사 후 전부 로테이트).
비밀 아닌 파라미터는 아래에 박제:

| 항목 | 값 | 용도 |
|---|---|---|
| `ANTHROPIC_API_KEY` | → SECRETS.local.md | 어댑터 LIVE 모드 (VM 메타데이터 `sail-anthropic-key`로 주입) |
| `HF_TOKEN` | → SECRETS.local.md (계정 younjihoon) | 데이터셋 5종 다운로드/업로드 |
| VESSL 서빙 URL | `https://api-wsp-2udsccqmif6o.betelgeuse.cloud.vessl.ai` | `VESSL_META_URL` / VM 메타데이터 `sail-vessl-url` |
| Jupyter 토큰 | → SECRETS.local.md | 볼륨 파일 IO (ops/81 §3) |
| VESSL org | `sweetspot` | vesslctl --org (로그인은 브라우저 OAuth — 유일한 수동 단계) |
| GCP | project `sweetspot-ax` · zone `asia-northeast3-a` · bucket `gs://sweetspot-ax-sail-adapter` | ops/80 |
| GitHub | upstream `DanRo-AX/Ralphthon-ICML-SAIL` (RO) · fork `alexlee8930/Ralphthon-ICML-SAIL` (push) | PR 플로우 |

수동 개입이 필요한 유일한 두 지점: ① `gcloud auth login` / `vesslctl auth login`
(브라우저 OAuth) ② VESSL 크레딧 충전. 나머지는 전부 CLI로 무인 진행 가능.

## 4. 보조 명령

한 단위만 다시 굽기 (특정 화면이 어긋났을 때):
```
./sail-spec/ui/5X-<이름>.md 만 보고 명시된 산출 파일을 처음부터 다시 구현하라.
00-INDEX 공통 원칙 준수. 다른 파일은 절대 건드리지 말 것. 끝나면 npx tsc -b 확인.
```

원본과 비교 검증:
```
지금 동작을 ./sail-spec/golden/ 과 비교하라: flows.md 체크리스트를 순서대로 수행하고,
API 응답은 golden/*.json 과 형태(필드·구조)를 대조해 다른 부분을 나열한 다음,
각각 어느 단위 스펙과 어긋난 건지 짚고 스펙에 맞춰 수정하라.
```

## 5. 리허설 프로토콜 (골든 리플레이)

1. 빈 폴더에 `sail-spec/`만 복사하고 새 에이전트에게 §1 프롬프트를 그대로 준다.
2. G1(mock 플로우)까지 완주시킨 뒤, 원본 화면과 나란히 비교 — 어긋난 픽셀/동작을 나열.
3. 어긋남 각각을 "스펙의 어느 단위가 불충분했나"로 귀속시켜 **스펙에 역반영** (구현을
   고치는 게 아니라 스펙을 고친다 — 다음 재구현자가 같은 함정에 빠지지 않도록).
4. 시간이 되면 G2(백엔드 폴백 e2e)와 G3(새 VM 배포)까지 확장.

## 6. 콜드스타트 전체 순서 (요약 카드)

```
[수동 2회: gcloud/vesslctl 로그인] → 웨이브0 → 웨이브1 → G1
→ 웨이브2E → G2 → 웨이브2F(ops/80 §2 최초생성 → §3 배포루프) → G3
→ 웨이브2G(85 사전 스테이징) → GPU 3시간 창 → 게이트 승격 → 연속학습(중지까지)
```
