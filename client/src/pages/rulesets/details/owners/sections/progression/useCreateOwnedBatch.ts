import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { formatWordCount } from "@/client/src/lib/rulesetLabels.ts";
import type { OwnedFormData } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { ownedEntitiesQuery, ownerParam } from "@/client/src/pages/rulesets/details/owners/ownerSectionQueries.ts";
import { useOwnerCopy } from "@/client/src/pages/rulesets/details/owners/sections/useOwnerCopy.ts";
import { invalidateRulesetEdit } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import type { RulesWord } from "@/shared/rulesets.ts";
import { toSentenceCase } from "@/shared/text.ts";

/** What an owner's owned entities' create is of: its owner's kind, and its messages' word for them. */
interface OwnedBatchOf {
  /** Its owned entities' kind (3.5's `class-levels`), whose pages it refreshes: which of them can be deleted changes */
  ownedType: string;
  /** Its owner's kind (3.5's `classes`), whose routes it's sent through */
  ownerType: string;
  /** Its messages' word for the owned entities, singular and plural ("Class Level", "Class Levels") */
  word: RulesWord;
}

/**
 * The create of an owner's owned entities, one or several at once (3.5's class levels 6 to 15): one request that makes
 * them all or none, which says how many it made ("Class level created", "10 class levels created"), refreshes the
 * owner's tabs, its kind's list and the ruleset's changes, and follows the copy a create on an inherited owner makes.
 * `onCreated` closes its dialog.
 */
export function useCreateOwnedBatch(rulesetId: string, ownerId: string, of: OwnedBatchOf, onCreated: () => void) {
  const { ownedType, ownerType, word } = of;
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const { followCopy, queryKeysToInvalidate, tag } = useOwnerCopy(rulesetId, ownerType, ownerId);

  return useMutation({
    mutationFn: (owned: OwnedFormData[]) =>
      tag(
        parseResponse(
          rpc.api.rulesets[":id"].entities[":entityType"][":entityId"].owned.many.$post({
            ...ownerParam(rulesetId, ownerType, ownerId),
            json: { owned },
          }),
        ),
      ),
    onSuccess: (saved) => {
      const made = saved.created.length;
      snackbar.success(made === 1 ? `${toSentenceCase(word.one)} created` : `${formatWordCount(made, word)} created`);
      void invalidateRulesetEdit(queryClient, rulesetId, [
        ownedEntitiesQuery(rulesetId, ownerType, ownerId).queryKey,
        QUERY_KEYS.rulesets.entityPages(rulesetId, ownedType),
        ...queryKeysToInvalidate,
      ]);
      onCreated();
      followCopy(saved.ownerId, saved.sourceEntityId);
    },
    onError: (error, owned) =>
      snackbar.error(error, `Failed to create ${(owned.length === 1 ? word.one : word.many).toLowerCase()}`),
  });
}
