import type { PathCategory } from "@/engine/core/paths/PathCategory.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { type Dnd35Components } from "@/engine/rulesets/dnd3.5/character/CharacterComponents.ts";
import type { TargetPath } from "@/shared/customization/target.ts";

/** The spellcasting target paths: the highest arcane and divine spell levels castable. */
export default class SpellcastingPaths implements PathCategory<Dnd35Components> {
  readonly component = { key: "spellcasting", getter: "getSpellcasting" } as const;
  readonly description = "Maximum arcane or divine spell level castable";
  readonly label = "Spellcasting";
  readonly name = "spellcasting";

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
