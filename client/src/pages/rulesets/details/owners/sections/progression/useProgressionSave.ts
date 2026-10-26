import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import {
  ownerParam,
  type OwnerProgressionBody,
} from "@/client/src/pages/rulesets/details/owners/ownerSectionQueries.ts";
import { useOwnerCopy } from "@/client/src/pages/rulesets/details/owners/sections/useOwnerCopy.ts";
import { invalidateRulesetEdit } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** What an owner's progression's save is of: its kind, its levels' kind, and their words. */
interface ProgressionSaveOf {
  /** Its levels' kind (3.5's `class_levels`), whose pages it refreshes */
  levelType: string;
  /** The owner's kind (3.5's `classes`), whose routes it's sent through */
  ownerType: string;
  /** Its messages' word for what it saves: "Progression", its rules' word for what its tables count (3.5's "Spells") */
  what: string;
  /** Its messages' word for the owner, its kind's ("Class") */
  word: string;
}

/**
 * The save of an owner's Progression or tables' tab (`of`, what its messages name): one request for all it changed,
 * sent with the tokens its draft began over (`useOwnerDraft`'s), which refreshes every tab of the owner (its key's own)
 * and the pages of the levels it wrote, and follows the copy a save of an inherited owner makes. It stays pending until
 * they're read again, so the tab never shows its changes gone before their save comes back.
 */
export function useProgressionSave(rulesetId: string, ownerId: string, of: ProgressionSaveOf) {
  const { ownerType, levelType, what, word } = of;
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const { followCopy, queryKeysToInvalidate, tag } = useOwnerCopy(rulesetId, ownerType, ownerId);

  return useMutation({
    mutationFn: (body: OwnerProgressionBody) =>
      tag(
        parseResponse(
          rpc.api.rulesets[":id"].entities[":entityType"][":entityId"].progression.$put({
            ...ownerParam(rulesetId, ownerType, ownerId),
            json: { ...body },
          }),
        ),
      ),
    onSuccess: (saved) => {
      snackbar.success(`${word} ${what.toLowerCase()} saved`);
      followCopy(saved.entityId, saved.sourceEntityId);
    },
    onError: (error) => snackbar.error(error, `Failed to save the ${word.toLowerCase()} ${what.toLowerCase()}`),
    // The owner's tabs and its kind's list, refetched before the tab drops its edits (another tab's, read again as it
    // opens, takes no tokens till then), the ruleset's changes, and its levels' pages
    onSettled: async (saved) => {
      await invalidateRulesetEdit(queryClient, rulesetId, queryKeysToInvalidate);
      // The pages of the levels it wrote (a row's hover warms them), their modifiers and requirements among them
      const levelKeys = (saved?.ownedIds ?? []).flatMap((levelId) => [
        QUERY_KEYS.rulesets.entity(rulesetId, levelType, levelId),
        QUERY_KEYS.rulesets.customization(rulesetId, levelType, levelId, "modifiers"),
        QUERY_KEYS.rulesets.customization(rulesetId, levelType, levelId, "requirements"),
      ]);
      await Promise.all(levelKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
  });
}
