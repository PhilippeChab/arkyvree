import type { PathCategory } from "@/server/rulesets/engine/paths/PathCategory.ts";

/** The spellcasting target paths: the highest arcane and divine spell levels castable. */
export default class SpellcastingPaths implements PathCategory {
  readonly name = "spellcasting";
  readonly label = "Spellcasting";
  readonly description = "Maximum arcane or divine spell level castable";
  readonly holder = { key: "spellcasting", getter: "getSpellcasting" };
}
