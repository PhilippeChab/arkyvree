import { useQuery } from "@tanstack/react-query";

import type { RulesetDetail } from "@/client/src/lib/queries.ts";
import { rulesetChangesQuery } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { isRestorableDelete } from "@/client/src/pages/rulesets/restorableDelete.ts";

import { useRulesetPermissions } from "./useRulesetPermissions.ts";

/**
 * Whether deleting an entity of a ruleset, or what it holds, can be undone from Local Changes: one the ruleset inherits
 * (`isRestorableDelete`), or its copy of one, which its Local Changes list as modified and whose delete brings the
 * inherited one back. Until they load, and if they fail (`error`), a copy's delete says it's for good.
 */
export function useRestorableDelete(
  ruleset: RulesetDetail | undefined,
  entity: { id: string; rulesetId: string } | undefined,
) {
  const { canEditEntities } = useRulesetPermissions(ruleset);
  const inherits = !!ruleset?.rulesetId;
  const { data: changes, error } = useQuery({
    ...rulesetChangesQuery(ruleset?.id ?? ""),
    // Only an editor deletes, and only what a ruleset inherits comes back
    enabled: canEditEntities && inherits,
  });
  const copied =
    inherits && !!changes?.some((change) => change.status === "modified" && change.entityId === entity?.id);
  return { error, restorable: isRestorableDelete(ruleset, entity?.rulesetId) || copied };
}
