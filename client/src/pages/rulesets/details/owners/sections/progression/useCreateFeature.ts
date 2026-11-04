import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { ownerParam } from "@/client/src/pages/rulesets/details/owners/ownerSectionQueries.ts";
import { invalidateRulesetEdit } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { describeFeatureKey, type FeatureRow } from "./progressionDraft.ts";

const featuresApi = rpc.api.rulesets[":id"].entities[":entityType"][":entityId"].progression.features;

/**
 * Creating a feature an owner's owned entities can grant (`name`, as typed: "Hex"), which its rules name ("Hex
 * (Witch)") and put in its own pool, made by its first feature: once made, its row is the tab's (`onCreated`), granted
 * at no owned entity until one is clicked. Its granted kind's lists, its pools' and the owner's progression refresh,
 * which list the feature and the pool now.
 */
export function useCreateFeature(
  rulesetId: string,
  ownerType: string,
  ownerId: string,
  kinds: { granted: string; pools: string },
  onCreated: (row: FeatureRow) => void,
) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  return useMutation({
    mutationFn: async (name: string) =>
      parseResponse(featuresApi.$post({ ...ownerParam(rulesetId, ownerType, ownerId), json: { name } })),
    onSuccess: async (created) => {
      onCreated({
        key: describeFeatureKey({ toId: created.id, viaId: created.via.id }),
        grantedAt: [],
        name: created.name,
        toId: created.id,
        viaId: created.via.id,
        viaName: created.via.name,
      });
      snackbar.success(`${created.name} created`);
      await invalidateRulesetEdit(queryClient, rulesetId, [
        QUERY_KEYS.rulesets.section(rulesetId, kinds.granted),
        QUERY_KEYS.rulesets.section(rulesetId, kinds.pools),
        QUERY_KEYS.rulesets.ownerProgression(rulesetId, ownerId),
      ]);
    },
    onError: (error, name) => snackbar.error(error, `Failed to create ${name}`),
  });
}
