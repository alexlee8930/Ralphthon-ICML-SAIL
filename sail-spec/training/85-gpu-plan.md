# 85 · GPU 학습 플랜 — 3시간 재학습 + 무기한 체크포인트 연속학습

의존: ops/81 (vesslctl·서빙·HF·볼륨), 90-harness (시크릿)

목표: **fresh GPU에서 3시간 안에** 지금까지 발견한 결함을 전부 반영한 3-헤드 재학습을
완주하고, 3시간이 지나도 **운영자가 중지할 때까지 체크포인트를 보존하며 계속 학습**
(epoch마다 게이트 평가→통과 시 어댑터 자동 승격)한다.

> **트랙 성격**: G1~G3(제품)과 달리 이 트랙은 verbatim 재현이 아니라 **실행 플랜**이다.
> P3~P6·§3·§4의 스크립트(fetch_rejects / eval_gates / promote / fetch_lowtier / isotonic
> fit)는 이 플랜을 스펙 삼아 학습 창 전에 작성하는 산출물이며, 완성되면 `/data/code/`에
> 두고 이 문서에 경로를 역기입한다. VESSL 서빙측 `/data/serve/app.py`는 볼륨에 이미
> 존재한다(ops/81 §4).

## 0. 반영해야 하는 발견 (전부 실측 근거 — ops/81 §2 참조)

| # | 결함 | 실측 | 처방 |
|---|---|---|---|
| D1 | 리뷰어 SFT accept-only | val 249/249 채택 논문 (ICLR24/25+ICML25 소스) | ICLR 2018–23 리젝 8,506편 페어 투입 |
| D2 | 82:18 낙관 분포 | 코퍼스 38,703 vs 8,506 | (연도×결정) 층화 리웨이팅 |
| D3 | reject⟺옛날 교락 | 중립리뷰에서 정규화 p=0.99 / LLM-agent p=0.003 | 시대매칭 accept 페어 + 입력에서 venue/연도 단서 제거 + 추론측 리센시 보정(backend/61) |
| D4 | confidence→accept-prior 회귀 | rating6 conf5→2: p 0.001→0.924 | confidence는 학습 입력 유지, 하네스 review_floor에서 저확신=중립 처리 |
| D5 | 눈금(level) 부풀림, 랭킹은 정상(ρ=0.871) | score_head_v2 | isotonic 사후 캘리브레이션 (v2_margins_test2023.jsonl로 fit) |

## 1. 사전 스테이징 (창 열기 전 — 전부 CPU/네트워크, GPU 불요)

| # | 작업 | 명령/방법 |
|---|---|---|
| P1 | 크레딧 확인·충전 (`vesslctl billing show`) — 연속학습은 **~$5/hr 지속 소진**이므로 $300+ 권장 | 운영자 |
| P2 | 도는 잡 정리 + `vesslctl resourcespec list`로 B200/H100 스펙명 확인 | vesslctl |
| P3 | **리젝 페어 생성**: 코퍼스에서 ICLR 2018–23 리젝 8,506 pdf_url → PDF fetch(8워커) → pymupdf 텍스트 24k자 → (전문→각 실리뷰) 페어. 같은 연도 accept도 수집(시대 균형) | CPU 잡 1.5–4h |
| P4 | `astage-reviewer-sft-v2` 조립·HF 업로드: 기존 17,750 + P3 산출 + 층화 가중치 컬럼 | HF 토큰 |
| P5 | `ac-metareview-sft-v3` 조립: v2에 (연도×결정) 리웨이팅 + **입력에서 venue/연도 문자열 제거** | CPU |
| P6 | 평가 하네스: 리젝 held-out 100 + accept held-out 100 + 게이트 스크립트 + **저티어 학회 테스트셋(§4 G5)** | CPU |

## 2. 3시간 창 (T+0 런치 — 병렬 3잡, 전부 vesslctl)

```
T+0:00  런치 (ops/81 §6 뼈대 사용; --resourcespec은 P2에서 확인한 것)
 JOB-A 리뷰어 v2 : B200×4(또는 H100×8) DDP | Qwen3-8B LoRA | ctx 8k | reviewer-sft-v2
 JOB-B 메타 v3   : B200×2 | meta-sft-v3 | 층화 샘플러                → ~75–90분
 JOB-C 점수+캘리브: ×1 | 베이스 임베딩 재사용→헤드 재학습 + isotonic  → ~40분
T+0:10~ job logs 폴링 감시. loss 발산 시 즉시 재런치 (버퍼 ~40분 내장)
T+1:45  게이트 1 (JOB-A): 리젝 held-out mean rating ≤4.5 AND accept held-out ≥6
T+2:00  게이트 2 (JOB-B): test_2023 balanced-acc ≥ v2 + D3/D4 진단 재실행(격차 축소 확인)
T+2:15  승격: 어댑터를 /data/out/<name>_v3 로 복사 → 서빙 핫로드 → /health에 v3 확인
T+2:30  제품 스위치: `gcloud compute instances add-metadata sail-adapter
        --metadata sail-vessl-model=v3` 후 reset (assets/startup.sh가 이 attr을
        VESSL_META_MODEL로 주입). isotonic 곡선은 sail_adapter.py의
        calibrate 지점(`p_accept**0.25` 식)을 곡선 룩업으로 교체해 배포 —
        이 코드 교체가 이 트랙의 산출물 중 하나다. → golden 1회 완주
T+2:45  게이트 실패 시: 서빙 v2 유지(제품 무중단), 어댑터는 보존하고 연속학습으로 이관
```

## 3. 연속학습 모드 (3시간 이후 — 중지할 때까지)

각 학습 잡의 command를 **자가재개 래퍼**로 감싼다 (P3–P5 스크립트에 포함):

```bash
# 개념 뼈대 — 실제 스크립트는 /data/code/train_*.py 가 HF Trainer 기준으로 구현
while true; do
  python /data/code/train_reviewer.py \
    --output_dir /data/out/reviewer_cont \
    --save_steps 200 --save_total_limit 3 \
    --resume_from_checkpoint auto \        # 최신 checkpoint-* 자동 탐지
    --num_train_epochs 1 || true           # 죽어도(프리엠션·OOM) 루프가 재개
  python /data/code/eval_gates.py --run /data/out/reviewer_cont \
    && python /data/code/promote.py --run /data/out/reviewer_cont   # 게이트 통과 시만 서빙 승격
done
```

규칙:
- 체크포인트는 `/data/out/<run>/checkpoint-*` (objvol이라 잡이 죽어도 보존).
- **승격은 게이트 통과 시에만** — 서빙 중인 어댑터가 나빠지는 일이 없다.
- epoch마다 리젝 oversample 비율을 스케줄로 조금씩 낮춰(0.5→0.3) 과보정 방지.
- 중지: `vesslctl job terminate <slug>` — 마지막 체크포인트·승격본 그대로 남는다.
- 비용 감시: `vesslctl billing show` 를 승격 사이클마다 로그에 찍는다.

## 4. 평가 게이트 (전부 자동, P6 스크립트)

| 게이트 | 기준 |
|---|---|
| G1 리젝 인식 | 리젝 held-out 100편 mean rating ≤ 4.5, accept held-out ≥ 6.0 |
| G2 메타 균형 | test_2023 balanced accuracy ≥ v2 베이스라인 |
| G3 토픽 교락 | 중립리뷰 A/B: 정규화 vs LLM-agent p_accept 격차가 v2 대비 축소 |
| G4 confidence | rating 6 conf5→2의 p 변동폭이 v2(0.92) 대비 축소 |
| G5 **저티어 학회 테스트** | 아래 |

### G5 — 저티어 학회 논문은 리젝되어야 한다 (외부 타당성)

ICML보다 명백히 바가 낮은 학회에 실린 논문을 인터넷에서 수집해 파이프라인 전체에 넣으면
**대부분 accept 밴드(88) 미만**이어야 한다. 수집은 arXiv API로:

```python
# /data/code/fetch_lowtier.py 뼈대 — comments 필드에 저티어 학회명이 명시된 최근 논문
VENUES = ["ICMLA", "IJCNN", "ICPRAM", "ICONIP", "IntelliSys"]   # workshop급/지역 학회
# http://export.arxiv.org/api/query?search_query=cat:cs.LG AND comm:"Accepted at {V}"
# → 초록+본문(ar5iv HTML) 30편 수집 → 파이프라인 submit→finalize → 점수 분포
```

기준: **30편 중 score ≥ 88 이 3편 이하(90% 리젝)**, median ≤ 70. 실패하면 낙관 편향이
남아있다는 뜻 — isotonic 곡선을 저티어 분포를 포함해 다시 fit.

## 5. 비용

| 시나리오 | GPU-시간 | 비용 |
|---|---|---|
| 3시간 창 (A+B+C, B200 기준) | ~9 B200-h | ~$45–60 |
| 연속학습 (창 이후) | ~2 B200 상시 | **~$10/hr — 중지 전까지 계속** |
| 사전 CPU 잡 (P3) | — | ~$2–5 |

리뷰어 입력 24k자≈6k tok이 계산의 근거 (HF README 실측). 16k로 늘리면 2.5배.
