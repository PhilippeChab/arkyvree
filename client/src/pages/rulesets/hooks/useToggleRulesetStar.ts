import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useMutation, useQueryClient } from "@tanstack/react-query";

/** Star or unstar a ruleset; returns `toggleStar(id, isCurrentlyStarred)`. */
export function useToggleRulesetStar() {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const mutation = useMutation({
    mutationFn: async ({ id, starred }: { id: string; starred: boolean }) => {
      const param = { param: { id } };
      await (starred ? rpc.api.rulesets[":id"].star.$delete(param) : rpc.api.rulesets[":id"].star.$post(param));
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.lists });
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.detail(id) });
    },
    onError: (error, { starred }) => snackbar.error(error, starred ? "Failed to unstar ruleset" : "Failed to star ruleset"),
  });

  return (id: string, isCurrentlyStarred: boolean) => mutation.mutate({ id, starred: isCurrentlyStarred });
}
