import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { type ClassProgressionBody } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import { useClassCopy } from "@/client/src/pages/rulesets/details/classes/sections/useClassCopy.ts";
import { invalidateRulesetEdit } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/**
 * The save of a class's Progression or Spells tab (`what`, which its messages name: "Progression", its rules' word for
 * spells): one request for all it changed, sent with the tokens its draft began over (`useClassDraft`'s), which
 * refreshes every tab of the class (its key's own) and follows the copy a save of an inherited class makes. It stays
 * pending until they're read again, so the tab never shows its changes gone before their save comes back.
 */
export function useProgressionSave(rulesetId: string, classId: string, what: string) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const { followCopy, queryKeysToInvalidate, tag } = useClassCopy(rulesetId, classId);

  return useMutation({
    mutationFn: (body: ClassProgressionBody) =>
      tag(
        parseResponse(
          rpc.api.rulesets[":id"].entities[":entityType"][":entityId"].progression.$put({
            param: { id: rulesetId, entityType: "classes", entityId: classId },
            json: { ...body },
          }),
        ),
      ),
    onSuccess: (saved) => {
      snackbar.success(`Class ${what.toLowerCase()} saved`);
      followCopy(saved.entityId, saved.sourceEntityId);
    },
    onError: (error) => snackbar.error(error, `Failed to save the class ${what.toLowerCase()}`),
    // The class's tabs and the classes list, refetched before the tab drops its edits (another tab's, read again as it
    // opens, takes no tokens till then), the ruleset's changes, and its levels' pages
    onSettled: async (saved) => {
      await invalidateRulesetEdit(queryClient, rulesetId, queryKeysToInvalidate);
      // The pages of the levels it wrote (a row's hover warms them), their modifiers and requirements among them
      const levelKeys = (saved?.levelIds ?? []).flatMap((levelId) => [
        QUERY_KEYS.rulesets.entity(rulesetId, "klass_levels", levelId),
        QUERY_KEYS.rulesets.customization(rulesetId, "klass_levels", levelId, "modifiers"),
        QUERY_KEYS.rulesets.customization(rulesetId, "klass_levels", levelId, "requirements"),
      ]);
      await Promise.all(levelKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
  });
}
