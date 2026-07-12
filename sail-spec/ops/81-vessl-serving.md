# 81 · VESSL 연동 (서빙 계약 · CLI · 데이터 지도)

의존: 없음 (backend/60이 이 서빙을 호출; training/85가 이 인프라 위에서 실행)

## 1. CLI 셋업

```bash
# vesslctl (신형 CLI — 구형 `vessl`이 아님에 주의)
curl -fsSL https://install.vessl.ai/vesslctl | bash
vesslctl auth login          # 브라우저 OAuth — juneyoon 계정으로 로그인됨을 확인
vesslctl --org sweetspot workspace list
vesslctl billing show        # 크레딧·burn rate — 학습 전 반드시 확인
```

알려진 플랫폼 특성:
- `vesslctl job logs --limit` 최대 1000. 로그 스트리밍(follow)은 INTERNAL_ERROR가 나므로
  폴링으로 감시한다.
- **로그는 60-75분 지연 + print 버퍼링. 침묵≠사망** — 잡 생사는 job state와 볼륨
  산출물로만 판단하고, 타임아웃 전 임의 kill 금지 (kit CLAUDE.md 실측).
- 서빙 워크스페이스가 새 어댑터를 핫로드할 때 **/meta-review가 잠깐 503**을 낸다 —
  호출측은 8초 백오프 리트라이 (backend/60은 이미 처리).
- 잡 create "Server error"류 일시 오류 → 20초 후 같은 커맨드 재시도.
- 서빙 스택 구성(검증본): vLLM(:8001 멀티LoRA) + score_server(:8002, 8B+LoRA+head.pt)
  + app(:8000 프록시). 80GB GPU: vLLM gpu-mem-util 0.70 / 48GB(L40S): 0.50 필수
  (아니면 score_server OOM). 기동: `bash /data/serve/serve_vessl.sh`.

> **동반 하네스**: `github.com/juneyoon-sweetspot/ac-competition-kit` — VESSL 학습·서빙
> 트랙의 원본 하네스 (검증된 커맨드 vessl/commands.sh, 지뢰표, watch_job.sh, GCE 원샷
> 배포 backend/deploy_gce.sh + smoke.sh). training/85는 이 kit과 함께 쓰도록 설계됨.

## 2. 서빙 워크스페이스 (메타+점수 헤드)

| 항목 | 값 |
|---|---|
| 워크스페이스 | `ac-meta-demo2` (`wsp-2udsccqmif6o`, VESSL L40S ×1, betelgeuse-na) |
| 서빙 URL | `https://api-wsp-2udsccqmif6o.betelgeuse.cloud.vessl.ai` |
| Jupyter(파일 IO) | `https://jupyter-wsp-2udsccqmif6o.betelgeuse.cloud.vessl.ai/?token=84kuamlfv409ol95` |
| 헬스 | `GET /health` → `{"ok":true,"adapters":["v1","v2","v21",…]}` |

### POST /meta-review 계약 (서버가 프롬프트 소유 — 클라이언트는 재료만)

요청:
```json
{
  "model": "v2",
  "title": "논문 제목",
  "venue": "ICML 2026",
  "abstract": "초록 (없으면 어댑터가 Claude로 생성해 채움)",
  "reviews": [
    "Rating: 6: Marginally above acceptance threshold | Confidence: 4: You are confident in your assessment, but not absolutely certain\n[Summary Of The Paper] …\n[Strength And Weaknesses]\n…"
  ],
  "discussion": [ {"who": "Reviewer 2", "text": "…"}, {"who": "Authors", "text": "…"} ]
}
```

응답: `{"meta_review": "…", "p_accept": 0.83, "logit_margin": 1.75}`

**모델 핀 (ac-competition-kit 2026-07-12 확정)**: `model:"v21"`이 채택 레시피 —
로짓 정확도 89.1%/AUC 0.965, 생성 길이 p50 1,829자(요청 1750). v21은 프롬프트에
"Aim for roughly 1750 characters." 조건화가 필요하며 **서빙(app.py)이 자동 처리**한다.
v2는 폴백 경로. 어댑터 HF: `younjihoon/ac-metareview-v21`.

### POST /score — 학습된 점수헤드 (frozen v2 backbone + regression head)

요청: `{"title", "venue", "abstract", "reviews": [meta-review와 동일 포맷]}`
응답: `{"pred": 0.42, "score": 31.1}` — score는 실제 selectivity 분포에 캘리브레이션된
1-99 스케일. **test_2023 Spearman 0.872, 수상작 백분위 중앙 98.7.** 어댑터는 이걸
1순위로 쓰고(앵커 블렌드 불필요), 실패 시 p_accept^0.25 체인으로 폴백한다 (backend/60).

규칙 (어댑터가 이미 준수 — 재구현 시에도 동일하게):
- reviews의 Rating/Confidence 헤더는 **ICLR 정본 앵커 문구**를 그대로 쓴다
  (backend/60의 RATING_ANCHORS·CONFIDENCE_ANCHOR verbatim).
- discussion 키는 반드시 `{who, text}` — 서버가 `### {who} response`로 렌더하므로
  다른 키를 쓰면 전부 "Author response"로 뭉개진다.
- 빈 discussion이면 필드를 아예 생략 (서버의 anti-hallucination 가드).
- p_accept→점수 변환은 클라이언트(어댑터) 소관: `p^0.25×100 clamp(1,99)` 후
  앵커 블렌드 `0.6·cal + 0.4·(평균평점×10)`.

### 측정된 헤드 특성 (하네스 설계의 근거 — 재검증 시 이 실험 재현)
- **토픽 prior가 큼**: 동일 중립 리뷰에서 초록만 바꾸면 정규화 논문 p=0.99 vs
  LLM-agent 논문 p=0.003 (학습분포의 시대 교락). → backend/61 리센시 보정의 존재 이유.
- **confidence 레버 큼**: rating 6 고정, conf 5→2에서 p 0.001→0.924 (저확신 시 82%
  accept prior로 회귀). → 하네스는 저확신을 accept-prior가 아닌 중립으로 처리해야 함.
- 리뷰 > 초록 가중 (leave-one-out에서 리뷰 1건 제거로 margin ±12, 초록 변화는 ±0.4).

## 3. Jupyter contents API (볼륨 파일 IO — 학습 잡 없이 읽고 쓸 때)

```bash
J=https://jupyter-wsp-2udsccqmif6o.betelgeuse.cloud.vessl.ai; T=84kuamlfv409ol95
curl -s "$J/api/contents/data/out?token=$T"                 # 디렉토리 목록
curl -s "$J/api/contents/data/serve/app.py?token=$T"         # 파일 읽기(JSON.content)
curl -s -X PUT "$J/api/contents/data/code/x.py?token=$T" \
  -d '{"type":"file","format":"text","content":"…"}'         # 파일 업로드
```

## 4. 볼륨 지도 (`/data`, objvol-mtcv1pmhlq8s)

| 경로 | 내용 |
|---|---|
| `/data/serve/app.py` | 서빙 서버 (프롬프트 구성·ChatML·p_accept 산출의 원본) |
| `/data/code/` | 학습 스크립트 (train_score_head.py, train_concept_probes.py 등) |
| `/data/out/` | 어댑터·헤드 산출물 — **`/data/out/<name>` 에 두면 서빙이 핫로드** |
| `/data/eval/v2_margins_test2023.jsonl` | 3,767행 (pred vs 실제) — isotonic 캘리브레이션 재료 |
| `/data/sft_astage/` | 리뷰어 SFT (train 509MB / val 251행) |
| `/data/icml_gen/` | 생성 중간산출물 |

## 5. HF 데이터셋 (계정 younjihoon — 토큰은 90-harness)

| 데이터셋 | 내용 | 알려진 결함 |
|---|---|---|
| `astage-reviewer-sft` | (논문 전문 24k자 → 실리뷰) 17,750/250 | **accept-only** (ICLR24/25+ICML25 — 리젝 0). training/85가 고침 |
| `ac-metareview-sft-v2` / `-v21` | 메타리뷰 SFT + test_2023/test_2026 | 82:18 낙관 분포 (85가 층화로 완화) |
| `ac-metareview-score-data` | 점수 데이터 + criticism_dict | — |
| `icml-virtual-metareviews` | 가상 메타리뷰 32MB | — |

코퍼스 결정 분포 (로컬 `~/icml-ac/ralphthon/derived/train_pairs_with_inputs.csv`, 47,209행):
**리젝은 ICLR 2018–2023에만 8,506편 존재**(전원 pdf_url 보유), 2024+ 전 학회 리젝 0
(OpenReview 정책 변경). 이것이 낙관 편향·시대 교락의 근원 — training/85의 전제.

## 6. 잡 제출 패턴 (verbatim 뼈대)

```bash
vesslctl --org sweetspot job create \
  --name <잡이름> \
  --image pytorch/pytorch:2.12.1-cuda12.6-cudnn9-runtime \
  --resourcespec <GPU스펙명: vesslctl resourcespec list로 확인> \
  --volume objvol-mtcv1pmhlq8s:/data \
  --command 'set -e; pip install -q --break-system-packages transformers peft datasets accelerate; python /data/code/<script>.py'
vesslctl job list                       # state 확인
vesslctl job logs <slug> --limit 1000   # 폴링 감시 (follow 금지)
vesslctl job terminate <slug>           # 수동 중지
```
