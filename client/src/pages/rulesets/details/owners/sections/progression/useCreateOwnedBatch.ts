import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import type { OwnedFormData } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { ownedEntitiesQuery, ownerParam } from "@/client/src/pages/rulesets/details/owners/ownerSectionQueries.ts";
import { useOwnerCopy } from "@/client/src/pages/rulesets/details/owners/sections/useOwnerCopy.ts";
import { invalidateRulesetEdit } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** What a create of several owned entities is of: its owner's kind, and its messages' word for them. */
interface OwnedBatchOf {
  /** Its owner's kind (3.5's `classes`), whose routes it's sent through */
  ownerType: string;
  /** Its messages' word for the owned entities, plural ("Class levels") */
  what: string;
}

/**
 * The create of several of an owner's owned entities at once (3.5's class levels 6 to 15): one request that makes them
 * all or none, which says how many it made, refreshes the owner's tabs, its kind's list and the ruleset's changes, and
 * follows the copy a create on an inherited owner makes. `onCreated` closes its dialog.
 */
export function useCreateOwnedBatch(rulesetId: string, ownerId: string, of: OwnedBatchOf, onCreated: () => void) {
  const { ownerType, what } = of;
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
      snackbar.success(`${saved.created.length} ${what.toLowerCase()} created`);
      void invalidateRulesetEdit(queryClient, rulesetId, [
        ownedEntitiesQuery(rulesetId, ownerType, ownerId).queryKey,
        ...queryKeysToInvalidate,
      ]);
      onCreated();
      followCopy(saved.ownerId, saved.sourceEntityId);
    },
    onError: (error) => snackbar.error(error, `Failed to create ${what.toLowerCase()}`),
  });
}
