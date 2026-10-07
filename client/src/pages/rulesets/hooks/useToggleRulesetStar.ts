import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** Star or unstar a ruleset; returns `toggleStar(id, isCurrentlyStarred)`. */
export function useToggleRulesetStar() {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const mutation = useMutation({
    mutationFn: async ({ id, starred }: { id: string; starred: boolean }) => {
      const param = { param: { id } };
      await (starred
        ? parseResponse(rpc.api.rulesets[":id"].star.$delete(param))
        : parseResponse(rpc.api.rulesets[":id"].star.$post(param)));
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rulesets.lists });
      // Only the ruleset's own record shows the star; its sections share the key prefix.
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rulesets.detail(id), exact: true });
    },
    onError: (error, { starred }) =>
      snackbar.error(error, starred ? "Failed to unstar ruleset" : "Failed to star ruleset"),
  });

  return (id: string, isCurrentlyStarred: boolean) => mutation.mutate({ id, starred: isCurrentlyStarred });
}
