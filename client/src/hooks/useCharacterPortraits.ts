import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

import { attachmentSlotQuery } from "@/client/src/lib/queries.ts";

/**
 * The portraits of a list's characters, their URLs by id (`null` for one without): a query per character, not one
 * batch, so a page that comes in fetches its own alone and the pages before it read their cached ones. The map is new
 * each render: read it inline (`portraits.get(id)`), never in a hook's deps.
 */
export function useCharacterPortraits(characters: readonly { id: string }[]) {
  // The queries read the ids: the same array while the list stays the same
  const recordIds = useMemo(() => characters.map((character) => character.id), [characters]);
  const queries = useQueries({
    queries: recordIds.map((recordId) => attachmentSlotQuery({ name: "portrait", recordId })),
  });
  return new Map(recordIds.map((recordId, index) => [recordId, queries[index]?.data?.url ?? null]));
}
