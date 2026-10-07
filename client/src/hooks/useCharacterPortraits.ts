import { useMemo } from "react";

import { useAttachments } from "./useAttachments.ts";

/**
 * The portraits of a list's characters, their URLs by id (`null` for one without): a query per character, so a page
 * that comes in fetches its own alone.
 */
export function useCharacterPortraits(characters: readonly { id: string }[]) {
  // The queries read the ids: the same array while the list stays the same
  const recordIds = useMemo(() => characters.map((character) => character.id), [characters]);
  return useAttachments({ recordType: "Character", name: "portrait", recordIds }).data;
}
