import type { RulesetData } from "@/server/cache/rulesetCache/index.ts";
import type { PathCategory } from "@/server/rulesets/engine/paths/PathCategory.ts";
import type { TargetPath } from "@/shared/customization/target.ts";

/** The spellcasting target paths: the highest arcane and divine spell levels castable. */
export default class SpellcastingPaths implements PathCategory {
  readonly name = "spellcasting";
  readonly label = "Spellcasting";
  readonly description = "Maximum arcane or divine spell level castable";
  readonly holder = { key: "spellcasting", getter: "getSpellcasting" };

  generate(_rulesetData: RulesetData, kind: "modifier" | "requirement"): TargetPath[] {
    if (kind !== "requirement") return [];
    const numericOps = [
      "equal",
      "not_equal",
      "greater_than",
      "less_than",
      "greater_than_or_equal",
      "less_than_or_equal",
    ];
    return [
      {
        path: "spellcasting.arcane",
        category: "spellcasting",
        description: "Max arcane spell level castable",
        valueType: "number",
        operators: numericOps,
      },
      {
        path: "spellcasting.divine",
        category: "spellcasting",
        description: "Max divine spell level castable",
        valueType: "number",
        operators: numericOps,
      },
    ];
  }
}
