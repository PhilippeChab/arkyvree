import type { PathCategory } from "@/engine/core/paths/PathCategory.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { type Dnd52Components } from "@/engine/rulesets/dnd5.2/model/CharacterComponents.ts";
import { getOperators } from "@/shared/customization/operators.ts";
import {
  deriveSegmentLabels,
  isLeafOfKind,
  type OperatorKind,
  type TargetPath,
} from "@/shared/customization/target.ts";
import { MAX_SPELL_LEVEL } from "@/vocabulary/dnd5.2/spells.ts";

/** What a character's spellcasting counts, each for requirements only: what its classes' levels give it. */
const SPELLCASTING_PATHS = [
  {
    path: "casterlevel",
    description: "The levels counting toward spell slots: a full caster's all, a half caster's half, rounded up",
    type: "number" as const,
    requirementOnly: true,
  },
  {
    path: "highestslot",
    description: "The highest level of spell slots, by the Multiclass Spellcaster table",
    type: "number" as const,
    requirementOnly: true,
  },
  ...Array.from({ length: MAX_SPELL_LEVEL }, (_, i) => ({
    path: `slots.${i + 1}`,
    description: `Spell slots of level ${i + 1}`,
    type: "number" as const,
    requirementOnly: true,
  })),
  { path: "pact.slots", description: "Pact Magic slots", type: "number" as const, requirementOnly: true },
  { path: "pact.level", description: "Pact Magic slots' level", type: "number" as const, requirementOnly: true },
];

/** The spellcasting target paths: the levels counting toward spell slots, the slots, and the Pact Magic slots. */
export default class SpellcastingPaths implements PathCategory<Dnd52Components> {
  /** The spellcasting paths of `kind`, which every character has. */
  static generateSpellcastingPaths(kind: OperatorKind): TargetPath[] {
    return SPELLCASTING_PATHS.filter((subPath) => isLeafOfKind(subPath, kind)).map((subPath) => ({
      path: `spellcasting.${subPath.path}`,
      category: "spellcasting",
      description: subPath.description,
      valueType: subPath.type,
      operators: getOperators(subPath.type, kind),
    }));
  }

  readonly component = { key: "spellcasting", getter: "getSpellcasting" } as const;

  readonly description = "Spell slots and the levels counting toward them";

  readonly label = "Spellcasting";

  readonly name = "spellcasting";

  generate(_rulesetData: RulesetData, kind: OperatorKind): TargetPath[] {
    return SpellcastingPaths.generateSpellcastingPaths(kind);
  }

  getSegmentLabels(): Record<string, string> {
    return {
      ...deriveSegmentLabels(SPELLCASTING_PATHS),
      casterlevel: "Caster Level",
      highestslot: "Highest Slot",
      pact: "Pact Magic",
    };
  }
}
