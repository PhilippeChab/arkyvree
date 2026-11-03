import { keepPreviousData, useQueries } from "@tanstack/react-query";

import { useListboxQuery } from "@/client/src/hooks/index.ts";
import { rulesetOptionsQuery } from "@/client/src/lib/queries.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { entityOptionsQuery } from "@/client/src/pages/rulesets/optionQueries.ts";

/**
 * Loads a kind's form's pickers alongside its entity (`fields`, its rules'): every entity of the kinds its references
 * and amounts read (3.5's saves, a spell's and a class level's), and, for who can edit it (`canEdit`), the first page
 * of the kind its grants pick from (a class level's feats), as their inputs ask them.
 */
export function useFormOptions(rulesetId: string, fields: readonly EntityField[] | undefined, canEdit: boolean) {
  const lists = new Set(
    (fields ?? []).flatMap((field) => (field.input === "ref" || field.input === "amounts" ? [field.references] : [])),
  );
  useQueries({ queries: [...lists].map((list) => rulesetOptionsQuery(list, rulesetId)) });
  const grants = fields?.find((field) => field.input === "grants");
  useListboxQuery({
    ...entityOptionsQuery(rulesetId, grants?.references, "", { limit: 50 }),
    placeholderData: keepPreviousData,
    enabled: canEdit,
  });
}
