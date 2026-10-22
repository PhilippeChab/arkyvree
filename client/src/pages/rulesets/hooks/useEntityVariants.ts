import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDialogState, useFormWith } from "@/client/src/hooks/index.ts";
import { type EntityRow, entitySegment } from "@/client/src/lib/entityRequests.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { invalidateRulesetEdit } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import {
  type EntityVariantsFormValues,
  type VariantRow,
  variantRow,
} from "@/client/src/pages/rulesets/details/sections/entityVariants.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

/**
 * A kind's entity's variants (`type`'s: an item's), as its row's Create Variants opens their dialog on it (`openOn`):
 * its dialog's state and form, and their create, which refreshes the kind's list and the ruleset's Local Changes.
 */
export function useEntityVariants(rulesetId: string, type: string) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const dialog = useDialogState<EntityRow>();
  const form = useFormWith<EntityVariantsFormValues>({ variants: [] });
  const segment = getUrlSegment(type);

  const mutation = useMutation({
    mutationFn: async ({ entityId, variants }: { entityId: string; variants: VariantRow[] }) =>
      parseResponse(
        rpc.api.rulesets[":id"].entities[":entityType"][":entityId"].variants.$post({
          param: { id: rulesetId, entityType: entitySegment(segment), entityId },
          json: { variants },
        }),
      ),
    onSuccess: (_, { variants }) => {
      snackbar.success(`${formatCount(variants.length, "variant")} created`);
      dialog.close();
      void invalidateRulesetEdit(queryClient, rulesetId, [QUERY_KEYS.rulesets.section(rulesetId, segment)]);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to create variants");
    },
  });

  const openOn = (entity: EntityRow) => {
    form.reset({ variants: [variantRow(entity, 1)] });
    dialog.openWith(entity);
  };

  const submit = (variants: VariantRow[]) => {
    if (dialog.target) mutation.mutate({ entityId: dialog.target.id, variants });
  };

  return { dialog, form, openOn, pending: mutation.isPending, submit };
}
