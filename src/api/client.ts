/**
 * HTTP client for the Ralph agent API.
 * Base URL comes from VITE_RALPH_API_URL; when unset the mock adapter serves
 * every request so the UI runs standalone.
 */
import { mockAdapter } from "./mock";
import type {
  Paper,
  PaperVersion,
  ScoreReport,
  SendMessageInput,
  Session,
  ThreadBlock,
  UploadPaperInput,
} from "./types";

const BASE = import.meta.env.VITE_RALPH_API_URL as string | undefined;

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${path}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export const api = {
  usingMock: !BASE,

  listPapers(): Promise<Paper[]> {
    return BASE ? http("/api/papers") : mockAdapter.listPapers();
  },
  getPaper(id: string): Promise<Paper> {
    return BASE ? http(`/api/papers/${id}`) : mockAdapter.getPaper(id);
  },
  listVersions(id: string): Promise<PaperVersion[]> {
    return BASE ? http(`/api/papers/${id}/versions`) : mockAdapter.listVersions(id);
  },
  uploadPaper(input: UploadPaperInput): Promise<Paper> {
    if (!BASE) return mockAdapter.uploadPaper(input);
    const form = new FormData();
    form.set("title", input.title);
    if (input.abstract) form.set("abstract", input.abstract);
    if (input.file) form.set("file", input.file);
    if (input.text) form.set("text", input.text);
    return http("/api/papers", { method: "POST", body: form, headers: {} });
  },
  getThread(paperId: string): Promise<ThreadBlock[]> {
    return BASE ? http(`/api/papers/${paperId}/thread`) : mockAdapter.getThread(paperId);
  },
  sendMessage(input: SendMessageInput): Promise<ThreadBlock[]> {
    if (!BASE) return mockAdapter.sendMessage(input);
    const form = new FormData();
    form.set("content", input.content);
    if (input.revision) form.set("revision", input.revision);
    return http(`/api/papers/${input.paperId}/messages`, {
      method: "POST",
      body: form,
      headers: {},
    });
  },
  requestReview(paperId: string): Promise<ThreadBlock> {
    return BASE
      ? http(`/api/papers/${paperId}/review`, { method: "POST" })
      : mockAdapter.requestReview(paperId);
  },
  requestMetaReview(paperId: string): Promise<ThreadBlock> {
    return BASE
      ? http(`/api/papers/${paperId}/metareview`, { method: "POST" })
      : mockAdapter.requestMetaReview(paperId);
  },
  getScore(paperId: string): Promise<ScoreReport> {
    return BASE ? http(`/api/papers/${paperId}/score`) : mockAdapter.getScore(paperId);
  },
  listSessions(): Promise<Session[]> {
    return BASE ? http("/api/sessions") : mockAdapter.listSessions();
  },
};
