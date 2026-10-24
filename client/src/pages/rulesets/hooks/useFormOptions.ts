import { keepPreviousData, useQueries } from "@tanstack/react-query";

import { useListboxQuery } from "@/client/src/hooks/index.ts";
import { type RulesDescription, rulesetOptionsQuery } from "@/client/src/lib/queries.ts";
import { entityOptionsQuery } from "@/client/src/pages/rulesets/optionQueries.ts";

/**
 * Loads a kind's form's pickers alongside its entity (`columns`, its rules'): every entity of the kinds its references
 * and amounts read (3.5's saves, a spell's and a class level's), and, for who can edit it (`canEdit`), the first page
 * of the kind its grants pick from (a class level's feats), as their inputs ask them.
 */
export function useFormOptions(
  rulesetId: string,
  columns: RulesDescription["columns"][string] | undefined,
  canEdit: boolean,
) {
  const lists = new Set(
    (columns ?? []).flatMap((column) =>
      column.input === "ref" || column.input === "amounts" ? [column.references] : [],
    ),
  );
  useQueries({ queries: [...lists].map((list) => rulesetOptionsQuery(list, rulesetId)) });
  const grants = columns?.find((column) => column.input === "grants");
  useListboxQuery({
    ...entityOptionsQuery(rulesetId, grants?.references, "", { limit: 50 }),
    placeholderData: keepPreviousData,
    enabled: canEdit,
  });
}
