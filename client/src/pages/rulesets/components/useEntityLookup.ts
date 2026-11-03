import { useState } from "react";

import type { EntityRow } from "@/client/src/lib/entityRequests.ts";

/** An entity a form names, as a picker shows it: its id and its name. */
type NamedEntity = Pick<EntityRow, "id" | "name">;

/**
 * The records of the entities a form keeps the ids of: the ones known when it mounted, the current ones and any picked
 * since, so the form stores plain ids and its pickers still show every selected entity by name.
 */
export function useEntityLookup(known: NamedEntity[]) {
  const [seen, setSeen] = useState<ReadonlyMap<string, NamedEntity>>(() => new Map(known.map((e) => [e.id, e])));
  const byId = new Map([...seen, ...known.map((e) => [e.id, e] as const)]);
  return {
    resolve: (ids: string[]) => ids.flatMap((id) => byId.get(id) ?? []),
    remember: (entities: NamedEntity[]) =>
      setSeen((prev) => {
        const next = new Map(prev);
        for (const entity of entities) next.set(entity.id, entity);
        return next;
      }),
  };
}
