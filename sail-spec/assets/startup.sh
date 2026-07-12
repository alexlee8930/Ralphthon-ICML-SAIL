#!/bin/bash
# GCE 인스턴스 startup-script — GCS에서 어댑터·웹번들·데이터를 당겨 systemd로 서빙.
# SSH 없이 전부 메타데이터로 프로비저닝된다 (ops/80 런북 참조).
set -e
mkdir -p /opt/sail
TOKEN=$(curl -s -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
gcs() { curl -sf -H "Authorization: Bearer $TOKEN" "https://storage.googleapis.com/storage/v1/b/${SAIL_BUCKET:-sweetspot-ax-sail-adapter}/o/$1?alt=media" -o "$2"; }
attr() { curl -sf -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1" || true; }
VMODEL=$(attr sail-vessl-model); VMODEL=${VMODEL:-v2}   # 어댑터 스왑 스위치 (training/85 §2)
SHEAD=$(attr sail-score-head); SHEAD=${SHEAD:-1}        # 학습 점수헤드 on/off (0 = 원래 p_accept 경로)
gcs sail_adapter.py /opt/sail/sail_adapter.py
gcs web.tar.gz /tmp/web.tar.gz
gcs topic_maturity.json /opt/sail/topic_maturity.json || true  # 없으면 리센시 보정만 비활성(무해)
rm -rf /opt/sail/web && mkdir -p /opt/sail/web && tar -xzf /tmp/web.tar.gz -C /opt/sail/web
if [ ! -x /opt/sail/venv/bin/python ]; then
  apt-get update -qq && apt-get install -y -qq python3-venv > /dev/null
  python3 -m venv /opt/sail/venv
fi
/opt/sail/venv/bin/pip install -q fastapi 'uvicorn[standard]' python-multipart pymupdf 'anthropic>=0.92.0' 'httpx>=0.27'
cat > /etc/systemd/system/sail-adapter.service <<UNIT
[Unit]
Description=ICML SAIL adapter
After=network.target

[Service]
WorkingDirectory=/opt/sail
Environment=SAIL_STATE_PATH=/opt/sail/sail_state.json
Environment=WEB_DIST=/opt/sail/web
Environment=PORT=8100
Environment=TOPIC_MATURITY_PATH=/opt/sail/topic_maturity.json
Environment=ANTHROPIC_API_KEY=$(attr sail-anthropic-key)
Environment=VESSL_META_URL=$(attr sail-vessl-url)
Environment=VESSL_META_MODEL=$VMODEL
Environment=SAIL_SCORE_HEAD=$SHEAD
ExecStart=/opt/sail/venv/bin/python /opt/sail/sail_adapter.py
Restart=always

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable sail-adapter
systemctl restart sail-adapter
sleep 3
echo "SAIL-DEBUG key_len=$(attr sail-anthropic-key | wc -c) vessl=$(attr sail-vessl-url)"
echo "SAIL-DEBUG healthz=$(curl -s -m 5 localhost:8100/healthz)"
