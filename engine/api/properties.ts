import type { RulesetView } from "@/engine/core/types.ts";
import type { PropertyEntityType } from "@/shared/customization/entities.ts";

import { getRulesetModule } from "./modules.ts";

/** The ruleset's property types: those its rules read. */
function propertyTypesOf(view: RulesetView) {
  return getRulesetModule(view.ruleset.baseRules).createPropertyTypes();
}

/** The property types the ruleset's rules read (of an entity type, when given), each with its description. */
export function getPropertyTypes(view: RulesetView, entityType?: PropertyEntityType) {
  return propertyTypesOf(view).getStaticPropertyTypes(entityType);
}

/** The values the ruleset's rules know a property type takes, none when they know none. */
export function getPropertyValues(view: RulesetView, type: string) {
  return propertyTypesOf(view).getStaticPropertyValues(type) ?? [];
}
