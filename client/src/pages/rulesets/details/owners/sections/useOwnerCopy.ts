import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { ownerDetailQuery } from "@/client/src/pages/rulesets/details/owners/ownerSectionQueries.ts";
import { followCopiesOf } from "@/client/src/pages/rulesets/followCopies.ts";
import { useCopyOnWrite } from "@/client/src/pages/rulesets/hooks/index.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

/**
 * What an owner's tab's save does once it copies an inherited owner (its levels', its skills', its customizations'): it
 * refreshes the owner and its kind's list, where the copy takes the owner's place (`queryKeysToInvalidate`), and the
 * page follows the copy (`followCopy`) of the owner its request was sent for (`tag`, `followCopiesOf`'s).
 */
export function useOwnerCopy(rulesetId: string, ownerType: string, ownerId: string) {
  return {
    followCopy: useCopyOnWrite(rulesetId, ownerId, (id) => `${getUrlSegment(ownerType)}/${id}`).followCopy,
    queryKeysToInvalidate: [
      ownerDetailQuery(rulesetId, ownerType, ownerId).queryKey,
      QUERY_KEYS.rulesets.section(rulesetId, getUrlSegment(ownerType)),
    ],
    tag: followCopiesOf(ownerId).tag,
  };
}
