/**
 * TanStack Query hooks over the Ralph agent API.
 * All server state flows through these; Recoil holds UI-only state.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "./client";
import type { SendMessageInput, UploadPaperInput } from "./types";

export const keys = {
  papers: ["papers"] as const,
  paper: (id: string) => ["papers", id] as const,
  versions: (id: string) => ["papers", id, "versions"] as const,
  thread: (id: string) => ["papers", id, "thread"] as const,
  score: (id: string) => ["papers", id, "score"] as const,
  sessions: ["sessions"] as const,
};

export function usePapers() {
  return useQuery({ queryKey: keys.papers, queryFn: api.listPapers });
}

export function usePaper(id: string | undefined) {
  return useQuery({
    queryKey: keys.paper(id ?? ""),
    queryFn: () => api.getPaper(id!),
    enabled: !!id,
  });
}

export function useVersions(id: string | undefined) {
  return useQuery({
    queryKey: keys.versions(id ?? ""),
    queryFn: () => api.listVersions(id!),
    enabled: !!id,
  });
}

export function useThread(paperId: string | undefined) {
  return useQuery({
    queryKey: keys.thread(paperId ?? ""),
    queryFn: () => api.getThread(paperId!),
    enabled: !!paperId,
  });
}

export function useScore(paperId: string | undefined) {
  return useQuery({
    queryKey: keys.score(paperId ?? ""),
    queryFn: () => api.getScore(paperId!),
    enabled: !!paperId,
  });
}

export function useSessions() {
  return useQuery({ queryKey: keys.sessions, queryFn: api.listSessions });
}

export function useUploadPaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UploadPaperInput) => api.uploadPaper(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.papers });
      void qc.invalidateQueries({ queryKey: keys.sessions });
    },
  });
}

export function useSendMessage(paperId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<SendMessageInput, "paperId">) =>
      api.sendMessage({ ...input, paperId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.thread(paperId) });
      void qc.invalidateQueries({ queryKey: keys.paper(paperId) });
      void qc.invalidateQueries({ queryKey: keys.versions(paperId) });
    },
  });
}

export function useRequestReview(paperId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.requestReview(paperId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.thread(paperId) });
      void qc.invalidateQueries({ queryKey: keys.paper(paperId) });
    },
  });
}

export function useRequestMetaReview(paperId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.requestMetaReview(paperId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.thread(paperId) });
      void qc.invalidateQueries({ queryKey: keys.paper(paperId) });
      void qc.invalidateQueries({ queryKey: keys.score(paperId) });
    },
  });
}
