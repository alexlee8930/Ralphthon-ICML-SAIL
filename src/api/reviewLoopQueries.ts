/** TanStack Query hooks for the review loop (cycle model). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { loopApi, type LoopPaper, type SubmitLoopPaperInput } from "./reviewLoop";

export const loopKeys = {
  all: ["loop", "papers"] as const,
  one: (id: string) => ["loop", "papers", id] as const,
};

export function useLoopPapers() {
  return useQuery({ queryKey: loopKeys.all, queryFn: loopApi.list });
}

export function useLoopPaper(id: string | undefined) {
  return useQuery({
    queryKey: loopKeys.one(id ?? ""),
    queryFn: () => loopApi.get(id!),
    enabled: !!id,
  });
}

function usePaperMutation<TVars>(fn: (vars: TVars) => Promise<LoopPaper>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (paper) => {
      qc.setQueryData(loopKeys.one(paper.id), paper);
      void qc.invalidateQueries({ queryKey: loopKeys.all });
    },
  });
}

export function useSubmitLoopPaper() {
  return usePaperMutation((input: SubmitLoopPaperInput) => loopApi.submit(input));
}

export function useReply(id: string) {
  return usePaperMutation((input: { text: string; replyTo?: string }) => loopApi.reply(id, input));
}

export function useRevisionDraft(id: string) {
  return usePaperMutation((_: void) => loopApi.revisionDraft(id));
}

export function useRevisionApply(id: string) {
  return usePaperMutation((decisions: Record<string, boolean>) => loopApi.revisionApply(id, decisions));
}

export function useFinalize(id: string) {
  return usePaperMutation((_: void) => loopApi.finalize(id));
}

export function useResubmit(id: string) {
  return usePaperMutation((_: void) => loopApi.resubmit(id));
}

export function useEditManuscript(id: string) {
  return usePaperMutation((input: { text: string; note?: string }) =>
    loopApi.editManuscript(id, input.text, input.note),
  );
}

/** Poll a running agent job (~0.7s) so its event stream renders live. */
export function useAgentJob(jobId: string | null) {
  return useQuery({
    queryKey: ["loop", "job", jobId ?? ""],
    queryFn: () => loopApi.job(jobId!),
    enabled: !!jobId,
    refetchInterval: (q) => (q.state.data && q.state.data.status !== "running" ? false : 700),
  });
}

export function useDeleteLoopPaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => loopApi.remove(id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: loopKeys.one(id) });
      void qc.invalidateQueries({ queryKey: loopKeys.all });
    },
  });
}
