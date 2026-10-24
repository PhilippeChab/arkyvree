import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { classDetailQuery } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import { followCopiesOf } from "@/client/src/pages/rulesets/followCopies.ts";
import { useCopyOnWrite } from "@/client/src/pages/rulesets/hooks/index.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

/**
 * What a class tab's save does once it copies an inherited class (its levels', its skills', its customizations'): it
 * refreshes the class and the classes list, where the copy takes the class's place (`queryKeysToInvalidate`), and the
 * page follows the copy (`followCopy`) of the class its request was sent for (`tag`, `followCopiesOf`'s).
 */
export function useClassCopy(rulesetId: string, classType: string, classId: string) {
  return {
    followCopy: useCopyOnWrite(rulesetId, classId, (id) => `${getUrlSegment(classType)}/${id}`).followCopy,
    queryKeysToInvalidate: [
      classDetailQuery(rulesetId, classType, classId).queryKey,
      QUERY_KEYS.rulesets.section(rulesetId, getUrlSegment(classType)),
    ],
    tag: followCopiesOf(classId).tag,
  };
}
