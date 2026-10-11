import type { PathCategory } from "@/engine/core/paths/PathCategory.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { type Dnd35Components } from "@/engine/rulesets/dnd3.5/model/CharacterComponents.ts";
import { getOperators } from "@/shared/customization/operators.ts";
import { deriveSegmentLabels, isLeafOfKind, type TargetPath } from "@/shared/customization/target.ts";

/**
 * The highest spell level castable, of each kind, and the highest caster level, of either kind and arcane: computed from
 * the character's classes, a requirement's only.
 */
const SPELLCASTING_PATHS = [
  { path: "arcane", description: "Max arcane spell level castable", type: "number" as const, requirementOnly: true },
  {
    path: "arcanecasterlevel",
    description: "Highest arcane caster level: an arcane class's level and its bonus caster levels",
    type: "number" as const,
    requirementOnly: true,
  },
  {
    path: "casterlevel",
    description: "Highest caster level: a spellcasting class's level and its bonus caster levels",
    type: "number" as const,
    requirementOnly: true,
  },
  { path: "divine", description: "Max divine spell level castable", type: "number" as const, requirementOnly: true },
];

/** The spellcasting target paths: the highest arcane and divine spell levels castable, and the highest caster levels. */
export default class SpellcastingPaths implements PathCategory<Dnd35Components> {
  /** The spellcasting paths of `kind`, which every character has, whatever its ruleset. */
  static generateSpellcastingPaths(kind: "modifier" | "requirement"): TargetPath[] {
    return SPELLCASTING_PATHS.filter((subPath) => isLeafOfKind(subPath, kind)).map((subPath) => ({
      path: `spellcasting.${subPath.path}`,
      category: "spellcasting",
      description: subPath.description,
      valueType: subPath.type,
      operators: getOperators(subPath.type, kind),
    }));
  }

  readonly component = { key: "spellcasting", getter: "getSpellcasting" } as const;
  readonly description = "Maximum spell level castable, arcane or divine, and caster level";
  readonly label = "Spellcasting";
  readonly name = "spellcasting";

  generate(_rulesetData: RulesetData, kind: "modifier" | "requirement"): TargetPath[] {
    return SpellcastingPaths.generateSpellcastingPaths(kind);
  }

  getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(SPELLCASTING_PATHS, {
      arcanecasterlevel: "Arcane Caster Level",
      casterlevel: "Caster Level",
    });
  }
}
