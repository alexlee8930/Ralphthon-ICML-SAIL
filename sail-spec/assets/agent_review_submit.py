#!/usr/bin/env python3
"""Track 1 Agent Review 제출 하네스 — openagentreview.org 공식 런북 준수.

우리 파이프라인(웹과 동일 백엔드)으로 리뷰를 '사전' 생성해두고, 16:35-17:00 KST
쓰기 창에는 검증된 페이로드를 초 단위로 POST만 한다.

서브커맨드:
  exchange   ~/.sail_agent_setup_token 파일의 셋업 토큰을 1회 교환 → ~/.sail_agent_bearer
             (토큰은 채팅/로그/URL 금지 — 파일로만 전달받는다. 15분 TTL, 1회용)
  status     GET /status (bearer) — guidance 그대로 출력
  assign     GET /assignments/current 1회 (10편 고정 할당) → assignments.json
  prepare    각 ordinal PDF 다운로드 → 파이프라인(리뷰3+메타+점수) → 스키마 매핑
             → payloads.json (창 열리기 전에 완료해둘 것. ~15-20분/10편, 3병렬)
  submit     [16:35,17:00) 창에서 payloads.json 전송. 매 POST 전 skill.md 재fetch.
  test-track 샌드박스 E2E 리허설: fixtures 10편 → prepare → POST/PUT/DELETE 1사이클

스키마 매핑 (공식 ← 우리):
  soundness/presentation ← 리뷰어 3인 중앙값 (1-4 직결)
  significance ← contribution 중앙값 (의미 동치)
  originality  ← 리뷰 텍스트 기반 미니 판정(Opus, 1-4; 실패 시 contribution)
  overall(1-6) ← rating(1-10) 중앙값 매핑표 {≤2:1, 3:2, 4-5:3, 6:4, 7-8:5, ≥9:6}
  confidence   ← 중앙값 (1-5 직결)
  comments     ← 공식 템플릿 렌더에서 Summary/Strengths/Weaknesses/Questions 결합(≤5000자)
"""
import argparse, json, re, statistics, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

OAR = "https://openagentreview.org"
SAIL = "http://8.230.3.211:8100"
HOME = Path.home()
BEARER_F = HOME / ".sail_agent_bearer"
TOKEN_F = HOME / ".sail_agent_setup_token"
WORK = Path("agent_reviews")
OVERALL_MAP = lambda r: 1 if r <= 2 else 2 if r <= 3 else 3 if r <= 5 else 4 if r <= 6 else 5 if r <= 8 else 6


def anthropic_key():
    import os
    k = os.environ.get("ANTHROPIC_API_KEY")
    if k:
        return k
    for cand in (Path(__file__).parent.parent / "SECRETS.local.md",):
        if cand.exists():
            m = re.search(r"sk-ant-[A-Za-z0-9_\-]+", cand.read_text())
            if m:
                return m.group(0)
    sys.exit("ANTHROPIC_API_KEY 없음")


def req(method, url, body=None, form=None, bearer=None, raw=False, timeout=180):
    data = (urllib.parse.urlencode(form).encode() if form
            else json.dumps(body).encode() if body is not None else None)
    h = {} if form else {"content-type": "application/json"}
    if bearer:
        h["Authorization"] = f"Bearer {bearer}"
    r = urllib.request.Request(url, data=data, method=method, headers=h)
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return resp.read() if raw else json.loads(resp.read())


def bearer():
    if not BEARER_F.exists():
        sys.exit(f"{BEARER_F} 없음 — 먼저 exchange를 실행하라")
    return BEARER_F.read_text().strip()


def fresh_skill():
    """상태 변경 호출 직전 canonical skill.md 재fetch (런북 의무)."""
    try:
        req("GET", f"{OAR}/api/ralphthon/v1/skill.md", raw=True, timeout=30)
    except Exception as e:  # noqa: BLE001
        print(f"[warn] skill.md fetch 실패({e}) — 런북상 진행 전 재시도 권장")


def guidance(d):
    g = d.get("guidance", {})
    print(f"  stage={g.get('stage')} action={g.get('next_action')}({g.get('next_action_actor')}) "
          f"reason={g.get('reason_code')} available={g.get('action_available')}")
    t = g.get("time", {})
    if t:
        print(f"  now={t.get('now')} window=[{t.get('window_opens_at')}, {t.get('window_closes_at')})")
    return g


def cmd_exchange(_):
    if not TOKEN_F.exists():
        sys.exit(f"셋업 토큰 파일 없음: {TOKEN_F}\n브라우저 Password & Security에서 발급해 이 파일에 저장(1줄), 15분 내 재실행.")
    tok = TOKEN_F.read_text().strip()
    d = req("POST", f"{OAR}/api/ralphthon/v1/agent-credential/exchange", body={"setup_token": tok})
    BEARER_F.write_text(d["access_token"])
    BEARER_F.chmod(0o600)
    TOKEN_F.unlink()  # 1회용 — 즉시 제거
    print("bearer 저장 완료 (파일 600).")
    guidance(d)


def cmd_status(_):
    d = req("GET", f"{OAR}/api/ralphthon/v1/status", bearer=bearer())
    print(json.dumps({k: d.get(k) for k in ("phase", "counts", "assigned", "submitted", "remaining")},
                     ensure_ascii=False))
    guidance(d)


def cmd_assign(_):
    WORK.mkdir(exist_ok=True)
    d = req("GET", f"{OAR}/api/ralphthon/v1/assignments/current", bearer=bearer())
    (WORK / "assignments.json").write_text(json.dumps(d, ensure_ascii=False, indent=1))
    for a in d.get("assignments", []):
        print(f"  #{a['ordinal']:2} [{a['status']}] {a['paper']['title'][:70]}")
    guidance(d)


def pipeline_one(base, ordinal, title, pdf_bytes, key):
    """PDF → 파이프라인 → 공식 스키마 페이로드."""
    import io, mimetypes  # noqa: F401
    # multipart 수동 구성 (백엔드가 PDF 텍스트 추출)
    boundary = "----sailb"
    parts = []
    parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"title\"\r\n\r\n{title}\r\n")
    parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; "
                 f"filename=\"p{ordinal}.pdf\"\r\nContent-Type: application/pdf\r\n\r\n")
    body = "".join(parts).encode() + pdf_bytes + f"\r\n--{boundary}--\r\n".encode()
    r = urllib.request.Request(f"{base}/api/loop/papers", data=body, method="POST",
                               headers={"content-type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(r, timeout=600) as resp:
        paper = json.loads(resp.read())
    pid = paper["id"]
    with urllib.request.urlopen(urllib.request.Request(
            f"{base}/api/loop/papers/{pid}/finalize", method="POST"), timeout=600) as resp:
        paper = json.loads(resp.read())
    cyc = paper["cycles"][0]
    revs = cyc["reviews"]
    med = lambda k, lo, hi: max(lo, min(hi, round(statistics.median(
        [r[k] for r in revs if isinstance(r.get(k), (int, float))] or [lo]))))
    rating = med("rating", 1, 10)
    # originality 미니 판정 (그라운딩: 리뷰 요약 기반; 실패 시 contribution 폴백)
    orig = med("contribution", 1, 4)
    try:
        rr = urllib.request.Request("https://api.anthropic.com/v1/messages",
            data=json.dumps({"model": "claude-opus-4-8", "max_tokens": 600,
                "system": "Output ONLY JSON {\"originality\": n} with n in 1-4 "
                          "(1 derivative, 2 incremental, 3 notable novelty, 4 highly original), "
                          "grounded strictly in the reviewer summaries.",
                "messages": [{"role": "user", "content": json.dumps(
                    [r["summary"] for r in revs], ensure_ascii=False)}]}).encode(),
            headers={"content-type": "application/json", "x-api-key": key,
                     "anthropic-version": "2023-06-01"})
        with urllib.request.urlopen(rr, timeout=120) as resp:
            txt = "".join(b.get("text", "") for b in json.loads(resp.read())["content"]
                          if b.get("type") == "text")
        m = re.search(r'"originality"\s*:\s*([1-4])', txt)
        if m:
            orig = int(m.group(1))
    except Exception as e:  # noqa: BLE001
        print(f"  [#{ordinal}] originality 판정 폴백(contribution): {e}")
    # comments: 리뷰 3건의 요약+핵심 이슈 결합 (증거 기반, ≤5000자)
    lines = [f"[Meta] {cyc.get('metaReview', '')[:800]}", ""]
    for i, r in enumerate(revs):
        lines.append(f"Reviewer {i+1} (rating {r['rating']}/10): {r['summary']}")
    lines.append("")
    for c in cyc.get("comments", [])[:9]:
        lines.append(f"- [{c['severity']}|{c['section']}] {c['body'][:300]}")
    comments = "\n".join(lines).strip()[:5000]
    # 정리
    urllib.request.urlopen(urllib.request.Request(
        f"{base}/api/loop/papers/{pid}", method="DELETE"), timeout=30)
    return {"ordinal": int(ordinal),
            "soundness": med("soundness", 1, 4), "presentation": med("presentation", 1, 4),
            "significance": med("contribution", 1, 4), "originality": int(orig),
            "overall": OVERALL_MAP(rating), "confidence": med("confidence", 1, 5),
            "comments": comments}


def validate(p):
    assert set(p) == {"ordinal", "soundness", "presentation", "significance",
                      "originality", "overall", "confidence", "comments"}, "필드 불일치"
    for k, lo, hi in (("ordinal", 1, 10), ("soundness", 1, 4), ("presentation", 1, 4),
                      ("significance", 1, 4), ("originality", 1, 4), ("overall", 1, 6),
                      ("confidence", 1, 5)):
        assert isinstance(p[k], int) and lo <= p[k] <= hi, f"{k} 범위/정수 위반: {p[k]}"
    assert isinstance(p["comments"], str) and p["comments"].strip(), "comments 공백"


def cmd_prepare(args):
    key = anthropic_key()
    b = bearer()
    WORK.mkdir(exist_ok=True)
    asg = json.loads((WORK / "assignments.json").read_text())["assignments"]
    base_pdf = (f"{OAR}/api/ralphthon/v1/test-track/assignments" if args.test
                else f"{OAR}/api/ralphthon/v1/assignments")

    def one(a):
        o = a["ordinal"]
        pdf = req("GET", f"{base_pdf}/{o}/pdf", bearer=b, raw=True, timeout=300)
        (WORK / f"p{o}.pdf").write_bytes(pdf)
        print(f"  [#{o}] PDF {len(pdf)//1024}KB → pipeline…", flush=True)
        p = pipeline_one(SAIL, o, a["paper"]["title"][:200], pdf, key)
        validate(p)
        print(f"  [#{o}] S{p['soundness']} P{p['presentation']} Sig{p['significance']} "
              f"O{p['originality']} overall {p['overall']}/6 conf {p['confidence']}")
        return p

    with ThreadPoolExecutor(max_workers=3) as ex:
        payloads = list(ex.map(one, asg))
    (WORK / "payloads.json").write_text(json.dumps(payloads, ensure_ascii=False, indent=1))
    print(f"준비 완료: {len(payloads)}건 → {WORK/'payloads.json'} (창 열리면 submit)")


def cmd_submit(args):
    b = bearer()
    payloads = json.loads((WORK / "payloads.json").read_text())
    url = (f"{OAR}/api/ralphthon/v1/test-track/reviews" if args.test
           else f"{OAR}/api/ralphthon/v1/agent-reviews")
    ok = 0
    for p in payloads:
        validate(p)
        fresh_skill()  # 런북: 매 mutating 호출 전 재fetch
        try:
            if args.test:
                body = {k: v for k, v in p.items() if k != "ordinal"}  # 테스트트랙: 바디에 ordinal 금지
                d = req("POST", f"{url}/{p['ordinal']}", body=body, bearer=b)
            else:
                d = req("POST", url, body=p, bearer=b)
            ok += 1
            print(f"  [#{p['ordinal']}] OK submitted={d.get('submitted')} remaining={d.get('remaining')}")
        except urllib.error.HTTPError as e:
            detail = e.read().decode()[:300]
            print(f"  [#{p['ordinal']}] HTTP {e.code}: {detail}")
            if e.code == 403 and "writable" in detail:
                print("  → 쓰기 창 밖. window_opens_at까지 대기 후 재실행."); break
    print(f"{ok}/{len(payloads)} 제출.")


def cmd_test_track(_):
    """샌드박스 풀 리허설: assignments → prepare(3편만) → POST → PUT → DELETE 1사이클."""
    b = bearer()
    WORK.mkdir(exist_ok=True)
    d = req("GET", f"{OAR}/api/ralphthon/v1/test-track/assignments", bearer=b)
    (WORK / "assignments.json").write_text(json.dumps(
        {"assignments": d["assignments"][:3]}, ensure_ascii=False))
    print(f"fixtures {len(d['assignments'])}편 중 3편으로 리허설")
    ns = argparse.Namespace(test=True)
    cmd_prepare(ns)
    cmd_submit(ns)
    # PUT/DELETE 사이클 (1번 ordinal)
    p = json.loads((WORK / "payloads.json").read_text())[0]
    body = {k: v for k, v in p.items() if k != "ordinal"}
    body["comments"] = body["comments"] + "\n[updated in rehearsal]"
    fresh_skill()
    req("PUT", f"{OAR}/api/ralphthon/v1/test-track/reviews/{p['ordinal']}", body=body, bearer=b)
    print("PUT OK")
    fresh_skill()
    req("DELETE", f"{OAR}/api/ralphthon/v1/test-track/reviews/{p['ordinal']}", bearer=b)
    print("DELETE OK — 리허설 사이클 완료")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("exchange", "status", "assign", "test-track"):
        sub.add_parser(name)
    for name in ("prepare", "submit"):
        s = sub.add_parser(name)
        s.add_argument("--test", action="store_true")
    args = ap.parse_args()
    {"exchange": cmd_exchange, "status": cmd_status, "assign": cmd_assign,
     "prepare": cmd_prepare, "submit": cmd_submit,
     "test-track": cmd_test_track}[args.cmd](args)


if __name__ == "__main__":
    main()
