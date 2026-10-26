import { useQueryClient } from "@tanstack/react-query";

import { rulesetOptionsQuery } from "@/client/src/lib/queries.ts";
import { type LevelColumns, withAllAmounts } from "@/client/src/pages/rulesets/components/forms/index.ts";

/**
 * A level's amounts as its save sends them (`withAll`, each `{ toId, amount }`): every entity of the kind its `amounts`
 * column references (3.5's saves), 0 unset, off those its form's input loaded (`AmountsInput`, which shows their
 * failure); its own until they load. A level without amounts sends them as they are.
 */
export function useAllAmounts(rulesetId: string, amounts: LevelColumns["amounts"]) {
  const queryClient = useQueryClient();
  const withAll = (rows: unknown) =>
    amounts
      ? withAllAmounts(queryClient.getQueryData(rulesetOptionsQuery(amounts.references, rulesetId).queryKey), rows)
      : rows;
  return { withAll };
}
