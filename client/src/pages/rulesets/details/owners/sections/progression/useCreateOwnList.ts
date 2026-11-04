import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { ownerParam } from "@/client/src/pages/rulesets/details/owners/ownerSectionQueries.ts";
import { invalidateRulesetEdit } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";

const ownListApi = rpc.api.rulesets[":id"].entities[":entityType"][":entityId"].lists.own;

/**
 * Making an owner's own list with no entries yet (`ownerType`'s, `ownerId`: 3.5's class's "Barbarian Spells"), as its
 * rules name and make it, from its tables' tab. Once made, the owner's progression, its lists, and the lists' kind's
 * list and pickers (`listKind`: 3.5's aptitudes) refresh, which give its tables to fill.
 */
export function useCreateOwnList(
  rulesetId: string,
  ownerType: string,
  ownerId: string,
  { lists, listKind }: { listKind: string | undefined; lists: string },
) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  return useMutation({
    mutationFn: async (_name: string) =>
      await parseResponse(ownListApi.$post(ownerParam(rulesetId, ownerType, ownerId))),
    onSuccess: async (created) => {
      snackbar.success(`${created.name} created`);
      await invalidateRulesetEdit(queryClient, rulesetId, [
        QUERY_KEYS.rulesets.ownerProgression(rulesetId, ownerId),
        QUERY_KEYS.rulesets.ownerTable(rulesetId, ownerId, lists),
        ...(listKind ? [QUERY_KEYS.rulesets.section(rulesetId, listKind)] : []),
      ]);
    },
    onError: (error, name) => snackbar.error(error, `Failed to create ${name}`),
  });
}
