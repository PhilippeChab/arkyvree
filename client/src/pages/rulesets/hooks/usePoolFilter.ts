import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useSearchParam } from "@/client/src/hooks/index.ts";
import type { EntityRow } from "@/client/src/lib/entityRequests.ts";
import type { EntityKindDescription } from "@/client/src/lib/queries.ts";
import { pickedEntityQuery, seedEntity } from "@/client/src/pages/rulesets/details/entities/entityDetailQueries.ts";

/**
 * A ruleset list's pool filter (`pools`, its kind's), kept in the URL (at its `param`, the pool's id): the pool it
 * filters by, read back for its picker with its failure to load, and the change that picks one (the picked option seeds
 * the pool's cache, so the picker shows it at once). None where its kind narrows by no pool.
 */
export function usePoolFilter(rulesetId: string, pools: EntityKindDescription["pools"]) {
  const queryClient = useQueryClient();
  // A kind without pools reads none: its list never sets one
  const { value, setValue } = useSearchParam(pools?.param ?? "");
  const poolId = (pools && value) || undefined;
  const { data, error } = useQuery(pickedEntityQuery(rulesetId, pools?.type ?? "", poolId));
  const pool: EntityRow | null = poolId ? (data ?? null) : null;
  const setPool = (next: EntityRow | null) => {
    if (next && pools) seedEntity(queryClient, rulesetId, pools.type, next);
    setValue(next?.id ?? "");
  };
  return { pool, poolError: error, poolId, setPool };
}
