import { PropertyTypeCatalog } from "@/engine/core/customizations/index.ts";
import type { RulesetView } from "@/engine/core/types.ts";
import type { PropertyEntityType } from "@/shared/customization/entities.ts";

import { getRulesetModule } from "./modules.ts";

/** The ruleset's property types and values: those its rules read, and those its properties use. */
function catalogOf(view: RulesetView) {
  return new PropertyTypeCatalog(view.rulesetData, getRulesetModule(view.ruleset.baseRules).createPropertyTypes());
}

/** The property types an autocomplete offers for `query`: the rules' types, then the ruleset's own, by use. */
export function getPropertyTypeCompletions(view: RulesetView, query: string, entityType?: PropertyEntityType) {
  return catalogOf(view).completeTypes(query, entityType);
}

/** The values an autocomplete offers for a property of `type`: the rules' values, then the ruleset's own. */
export function getPropertyValueCompletions(view: RulesetView, type: string, query: string) {
  return catalogOf(view).completeValues(type, query);
}

/** The property types containing `query` (all of them for an empty one): the rules' types, then the ruleset's own. */
export function listPropertyTypes(view: RulesetView, query: string, entityType?: PropertyEntityType) {
  return catalogOf(view).listTypes(query, entityType);
}
