import type { PathCategory } from "@/server/rulesets/engine/paths/PathCategory.ts";

/** The abilities' target paths: each ability's score and modifier. */
export default class AbilitiesPaths implements PathCategory {
  readonly name = "abilities";
  readonly label = "Abilities";
  readonly description = "Ability scores and modifiers";
  readonly holder = { key: "abilities", getter: "getAbilities" };
  readonly groupDescriptionTemplates = { abilities: "{name} ability score and modifier" };
}
