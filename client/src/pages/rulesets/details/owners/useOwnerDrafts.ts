import { useContext } from "react";

import { OwnerDraftsContext } from "./ownerDraftsStore.ts";

/**
 * The drafts of the progression owner's page this is under (`OwnerDraftsContext`), read with zustand's `useStore`, or
 * in an event through `getState`: refused outside such a page.
 */
export function useOwnerDrafts() {
  const drafts = useContext(OwnerDraftsContext);
  if (!drafts) throw new Error("A progression owner's drafts are read under its page");
  return drafts;
}
