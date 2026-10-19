import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import {
  classDetailQuery,
  type ClassProgressionBody,
} from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import { useClassCopy } from "@/client/src/pages/rulesets/details/classes/sections/useClassCopy.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/**
 * The save of a class's Progression or Spells tab: one request for all it changed, sent with the class's token and its
 * levels' (`levels`, as the tab read them), which refreshes every tab of the class (its key's own) and follows the copy
 * a save of an inherited class makes. It stays pending until they're read again, so the tab never shows its changes
 * gone before their save comes back.
 */
export function useProgressionSave(
  rulesetId: string,
  classId: string,
  levels: readonly { id: string; updatedAt: string }[],
) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const { followCopy, queryKeysToInvalidate, tag } = useClassCopy(rulesetId, classId);

  return useMutation({
    mutationFn: (body: Omit<ClassProgressionBody, "levelTokens" | "updatedAt">) =>
      tag(
        parseResponse(
          rpc.api.rulesets[":id"].classes[":classId"].progression.$put({
            param: { id: rulesetId, classId },
            // The class's token as the page read it, which its details card keeps fresh
            json: {
              ...body,
              levelTokens: levels.map((level) => ({ levelId: level.id, updatedAt: level.updatedAt })),
              updatedAt: queryClient.getQueryData(classDetailQuery(rulesetId, classId).queryKey)?.updatedAt,
            },
          }),
        ),
      ),
    onSuccess: (saved) => {
      snackbar.success("Class progression saved");
      followCopy(saved.klassId, saved.sourceEntityId);
    },
    onError: (error) => snackbar.error(error, "Failed to save the class progression"),
    // The class's tabs and the classes list, refetched before the tab drops its edits, and the ruleset's changes
    onSettled: async () => {
      const keys = [...queryKeysToInvalidate, QUERY_KEYS.rulesets.changes(rulesetId)];
      await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
  });
}
