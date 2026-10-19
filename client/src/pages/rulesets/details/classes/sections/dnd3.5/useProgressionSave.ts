import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { type ClassProgressionBody } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import { useClassCopy } from "@/client/src/pages/rulesets/details/classes/sections/useClassCopy.ts";
import { invalidateRulesetEdit } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/**
 * The save of a class's Progression or Spells tab: one request for all it changed, sent with the tokens its draft began
 * over (`useClassDraft`'s), which refreshes every tab of the class (its key's own) and follows the copy a save of an
 * inherited class makes. It stays pending until they're read again, so the tab never shows its changes gone before
 * their save comes back.
 */
export function useProgressionSave(rulesetId: string, classId: string) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const { followCopy, queryKeysToInvalidate, tag } = useClassCopy(rulesetId, classId);

  return useMutation({
    mutationFn: (body: ClassProgressionBody) =>
      tag(
        parseResponse(
          rpc.api.rulesets[":id"].classes[":classId"].progression.$put({
            param: { id: rulesetId, classId },
            json: body,
          }),
        ),
      ),
    onSuccess: (saved) => {
      snackbar.success("Class progression saved");
      followCopy(saved.klassId, saved.sourceEntityId);
    },
    onError: (error) => snackbar.error(error, "Failed to save the class progression"),
    // The class's tabs and the classes list, refetched before the tab drops its edits, and the ruleset's changes
    onSettled: () => invalidateRulesetEdit(queryClient, rulesetId, queryKeysToInvalidate),
  });
}
