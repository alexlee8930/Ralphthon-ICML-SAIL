# 20 · 계약 (HTTP API · 로컬 스토리지)

의존: 01-foundation

산출 파일:

- `src/api/loopStorage.ts`

---

프론트↔백엔드 계약과 mock 영속화 계층.

## 1. 단일 타입 계약

타입의 원본은 `src/api/reviewLoop.ts` 상단 (api/30에 verbatim 수록). 다른 곳에
재정의 금지 — 항상 `import type { … } from "@/api/reviewLoop"`.

## 2. HTTP API 계약 (contract v2 "cycle model")

`VITE_RALPH_API_URL` 이 설정되면 아래 엔드포인트로 1:1 매핑된다
(구현: backend/60 sail_adapter.py). **한 사이클 = 실제 ICML 1회 제출**:
리뷰 도착 → 리버탈 스레드 → finalize 때만 메타리뷰+점수+결정 → resubmit 은
새 사이클(fresh context).

| 메서드·경로 | 역할 |
|---|---|
| POST `/api/loop/papers` (multipart: title, text?, file?) | 제출 → 리뷰 3건 생성. `?mode=async` 시 `{jobId}` 반환 |
| GET `/api/loop/papers` / GET `/api/loop/papers/{id}` | 목록/단건 (LoopPaper JSON) |
| DELETE `/api/loop/papers/{id}` | 세션 기록 삭제 |
| POST `…/{id}/reply` {text, replyTo?} | 리버탈 → 대상 리뷰어 응답 |
| POST `…/{id}/revision-draft` | AI 수정 헝크 초안 |
| POST `…/{id}/revision-apply` {decisions:{hunkId:bool}} | 헝크 allow/deny → draftManuscript + revisionNote |
| POST `…/{id}/manuscript` {text} | 원고 직접 편집(수동) — 스레드 메시지 없이 draft 갱신 |
| DELETE `…/{id}/draft` | 대기 중 draft 폐기 |
| POST `…/{id}/finalize` | AC 메타리뷰 + score + decision + deficiency (+decisionPost) |
| POST `…/{id}/resubmit` | draft를 새 사이클 원고로 fresh 재제출 |
| POST `…/{id}/jobs` {op, payload} → GET `/api/loop/jobs/{jobId}` | 비동기 잡 시작/폴링 (op: reply·revision-draft·finalize·resubmit) |
| GET `/healthz` | `{status, papers, live, vessl, contract:"v2-cycles"}` |

응답 본문은 항상 **LoopPaper 전체** (mock과 동일 형태) — UI는 mock/live를
구분하지 않는다. 점수는 finalize 이전엔 절대 존재하지 않는다.

## 3. IndexedDB 영속화 (mock 모드 전용)

아래 loopStorage.ts 가 유일한 스토리지 계층. DB `sail-loop` / 스토어 `papers`,
File 객체는 저장 전 제거(clean)하고 cycles 배열만 남긴다.


---

### 파일: `src/api/loopStorage.ts` (88줄) — **verbatim, 글자 그대로 사용**

````ts
/**
 * Local persistence for the review loop (mock mode).
 *
 * Papers — versions, scores, review comments, and manuscript text — accumulate
 * in the browser's IndexedDB, so history survives reloads and restarts; the
 * sidebar REVIEWS list is the entry point back into past loops. Uploaded PDF
 * files are stored as Blobs and re-issued fresh object URLs on load (object
 * URLs themselves die with the page session).
 *
 * When the real backend arrives (VITE_RALPH_API_URL), it owns storage and this
 * module is bypassed entirely.
 */
import type { LoopPaper } from "./reviewLoop";

const DB_NAME = "sail-ralph";
const STORE = "papers";
const DB_VERSION = 1;

/** What actually goes into IndexedDB: the paper plus the raw PDF blobs per
 *  version (object URLs are stripped — they are session-scoped). */
export interface StoredPaper {
  paper: LoopPaper;
  pdfBlobs: Record<number, Blob>;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "paper.id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadStoredPapers(): Promise<StoredPaper[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as StoredPaper[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return []; // storage unavailable (private mode etc.) → in-memory only
  }
}

export async function deleteStoredPaper(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // best-effort: in-memory removal already happened
  }
}

export async function persistPaper(paper: LoopPaper, pdfBlobs: Record<number, Blob>): Promise<void> {
  try {
    const db = await openDb();
    // Strip session-scoped object URLs before storing; they are re-issued on load.
    const clean: LoopPaper = structuredClone(paper);
    for (const c of clean.cycles) {
      if (c.manuscript.kind === "pdf") delete c.manuscript.url;
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ paper: clean, pdfBlobs } satisfies StoredPaper);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // best-effort: mock keeps working in memory
  }
}
````
