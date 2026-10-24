import { useMemo } from "react";

import { useRules } from "@/client/src/hooks/index.ts";
import type { RulesWords } from "@/client/src/lib/queries.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import { entityPageBack } from "@/client/src/pages/rulesets/entityPageState.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

/**
 * Where an entity page's Back goes, and its name (`entityPageBack`'s): a page with tabs, of a kind whose row opens its
 * progression (3.5's class's), named for its kind in its module's words, which the app has loaded before any page.
 */
export function useEntityPageBack(state: unknown, fallback: string, words: RulesWords | undefined) {
  const { all } = useRules();
  const tabbedPages = useMemo(
    () =>
      new Map(
        Object.values(all ?? {}).flatMap((rules) =>
          rules.kinds
            .filter((kind) => kind.opens === "progression")
            .map((kind) => [getUrlSegment(kind.type), entityTypeLabel(kind.type, rules.words)] as const),
        ),
      ),
    [all],
  );
  return entityPageBack(state, fallback, words, tabbedPages);
}
