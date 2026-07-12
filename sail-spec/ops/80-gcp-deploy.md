# 80 · GCP 배포 런북 (새 VM 콜드스타트 → 배포 루프)

의존: 프론트 빌드 산출물(dist), backend/60(sail_adapter.py), assets/(startup.sh · topic_maturity.json)

산출물: 외부에서 접근 가능한 단일 URL `http://<VM_IP>:8100` — SPA + API + healthz 전부 여기서.

설계 배경 (지키지 않으면 재현 실패):
- **Cloud Run 금지** — 조직 정책이 allUsers 노출을 막고 setIamPolicy 권한이 없어 404가 난다.
  검증된 경로는 **플레인 GCE VM + startup-script 프로비저닝**뿐이다.
- **SSH 불가 전제** — 방화벽이 회사 IP만 SSH를 허용하고 IAP도 권한이 없다. 따라서 VM에
  절대 SSH로 들어가지 않는다. 모든 프로비저닝은 startup-script(메타데이터)로, 모든 배포는
  "GCS 업로드 → instances reset"으로 한다.
- **업로드가 reset보다 먼저** — 순서가 바뀌면 부팅 시 이전 번들을 당겨 레이스가 난다.

---

## 1. CLI 셋업 (완전 콜드스타트)

```bash
# gcloud 설치(macOS): brew install --cask google-cloud-sdk
gcloud auth login                     # 브라우저 로그인 (조직 계정)
gcloud config set project sweetspot-ax
gcloud config set compute/zone asia-northeast3-a
```

고정 파라미터 (verbatim):

| 항목 | 값 |
|---|---|
| 프로젝트 | `sweetspot-ax` |
| 존 | `asia-northeast3-a` |
| VM 이름/태그 | `sail-adapter` |
| 머신타입 | `e2-small` (10GB pd-standard, debian-12) |
| 버킷 | `gs://sweetspot-ax-sail-adapter` |
| 포트 | `8100` (SPA+API 겸용) |
| 메타데이터 키 | `sail-anthropic-key`, `sail-vessl-url`, `sail-vessl-model` (기본 v2), `sail-score-head` (기본 1 — **0이면 학습 점수헤드 대신 원래 p_accept+앵커 경로**. 데모는 0 권장: 학습 헤드는 실학회 눈금이라 절대점수가 매우 짜게 나옴), `sail-venue` (기본 icml — **workshop이면 리뷰어가 4쪽 행사 바로 심사**. 해커톤 당일만 workshop, 95 §6) |

## 2. 최초 1회: 버킷·방화벽·VM 생성

```bash
# ① 버킷 (이미 있으면 skip)
gcloud storage buckets create gs://sweetspot-ax-sail-adapter --location=asia-northeast3

# ② 방화벽 (이미 있으면 skip)
gcloud compute firewall-rules create allow-sail-adapter-8100 \
  --allow tcp:8100 --source-ranges 0.0.0.0/0 --target-tags sail-adapter

# ③ 아티팩트 선업로드 (VM이 부팅하며 당겨간다 — 반드시 VM 생성 전에)
#    최초에는 VM_IP를 모르므로 일단 빈 URL로 빌드→생성→IP 확인→§3 재배포가 단순하다
npm run build && tar -czf /tmp/web.tar.gz -C dist .
gcloud storage cp serve/sail_adapter.py sail-spec/assets/topic_maturity.json /tmp/web.tar.gz \
  gs://sweetspot-ax-sail-adapter/

# ④ VM 생성 — startup-script는 assets/startup.sh 그대로
gcloud compute instances create sail-adapter \
  --machine-type=e2-small --tags=sail-adapter \
  --image-family=debian-12 --image-project=debian-cloud \
  --metadata-from-file=startup-script=sail-spec/assets/startup.sh \
  --metadata=sail-anthropic-key='<90-harness의 ANTHROPIC_API_KEY>',sail-vessl-url='https://api-wsp-2udsccqmif6o.betelgeuse.cloud.vessl.ai'

# ⑤ IP 확인 (ephemeral — stop/start 시 바뀔 수 있음, reset은 유지)
gcloud compute instances describe sail-adapter --format='value(networkInterfaces[0].accessConfigs[0].natIP)'
```

고정 IP가 필요하면: `gcloud compute addresses create sail-ip --region=asia-northeast3` 후
`instances delete-access-config` + `add-access-config --address`.

## 3. 배포 루프 (코드 바뀔 때마다 — 검증된 원라이너)

```bash
VM_IP=$(gcloud compute instances describe sail-adapter --format='value(networkInterfaces[0].accessConfigs[0].natIP)')
VITE_RALPH_API_URL=http://$VM_IP:8100 npm run build \
  && tar -czf /tmp/web.tar.gz -C dist . \
  && gcloud storage cp /tmp/web.tar.gz serve/sail_adapter.py gs://sweetspot-ax-sail-adapter/ \
  && gcloud compute instances reset sail-adapter
```

## 4. 검증 (G3)

```bash
# 부팅 ~60-90초. 새 번들 해시가 뜰 때까지 폴링:
HASH=$(grep -o 'assets/index-[^"]*\.js' dist/index.html)
for i in $(seq 1 50); do curl -s -m 5 http://$VM_IP:8100/ | grep -q "$HASH" && echo LIVE && break; sleep 8; done
curl -s http://$VM_IP:8100/healthz
# 기대: {"status":"ok","papers":"N","live":"True","vessl":"https://api-wsp-…","contract":"v2-cycles"}
# live가 "False"면 메타데이터 키 누락 → instances add-metadata 후 reset.
```

이후 golden/flows.md의 curl 6단계 시퀀스를 1회 완주한다 (golden/*.json이 기대 형태).

## 5. 디버깅 (SSH 없이)

```bash
gcloud compute instances get-serial-port-output sail-adapter | grep SAIL-DEBUG | tail -5
# startup.sh가 key_len / vessl URL / healthz 결과를 시리얼 콘솔에 찍는다.
```

흔한 증상: healthz의 `live:"False"` → 키 메타데이터 누락 · 이전 번들 서빙 → 업로드 전에
reset한 것(재업로드 후 다시 reset) · 502/timeout → 부팅 중(90초 대기).
