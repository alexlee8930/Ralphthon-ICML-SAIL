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
    for (const v of clean.versions) {
      if (v.manuscript.kind === "pdf") delete v.manuscript.url;
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
