import type { SeededFields } from "@/engine/rulesets/dnd3.5/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { getRulesetModule } from "./modules.ts";

/** A base rules' content: what its module answers the seeders and the codegen. */
function contentOf(baseRules: BaseRules) {
  return getRulesetModule(baseRules).content;
}

/** The target paths of a kind a book of the base rules can name, from the names of its abilities, saves and skills. */
export function listBookTargetPaths(
  baseRules: BaseRules,
  ...args: Parameters<ReturnType<typeof contentOf>["listBookTargetPaths"]>
) {
  return contentOf(baseRules).listBookTargetPaths(...args);
}

/** An entity's fields as the properties that keep them, in the base rules: what a seeder writes for them. */
export function toEntityProperties<K extends keyof SeededFields>(
  baseRules: BaseRules,
  entityType: K,
  fields: SeededFields[K],
) {
  return contentOf(baseRules).toEntityProperties(entityType, fields);
}
