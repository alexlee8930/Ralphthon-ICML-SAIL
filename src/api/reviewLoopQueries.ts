/** TanStack Query hooks for the review loop. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { loopApi, type SubmitLoopPaperInput } from "./reviewLoop";

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

export function useSubmitLoopPaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitLoopPaperInput) => loopApi.submit(input),
    onSuccess: (paper) => {
      qc.setQueryData(loopKeys.one(paper.id), paper);
      void qc.invalidateQueries({ queryKey: loopKeys.all });
    },
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

export function useReviseLoopPaper(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => loopApi.revise(id),
    onSuccess: (paper) => {
      qc.setQueryData(loopKeys.one(paper.id), paper);
      void qc.invalidateQueries({ queryKey: loopKeys.all });
    },
  });
}
