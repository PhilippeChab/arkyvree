import { getNumericOperators } from "@/shared/customization/operators.ts";
import { deriveSegmentLabels, type TargetPath } from "@/shared/customization/target.ts";
import type { KlassLevelSave, RulesetAbility, RulesetSave } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

import type DetailedCharacterAbilities from "./DetailedCharacterAbilities.ts";
import type DetailedCharacterClasses from "./DetailedCharacterClasses.ts";

const NAVIGATABLE_PATHS = [
  { path: "base", description: "Base save bonus from class levels", type: "number" as const },
  { path: "ability", description: "From key ability modifier", type: "number" as const, requirementOnly: true },
  { path: "misc", description: "From feats, items, and spells", type: "number" as const },
  { path: "total", description: "Final saving throw bonus", type: "number" as const, requirementOnly: true },
];

type DetailedCharacterComprehensiveSavingThrows = {
  [key: string]: {
    name: string;
    base: number;
    readonly ability: number;
    misc: number;
    readonly total: number;
  };
};

export default class DetailedCharacterSavingThrows {
  constructor(
    private readonly characterAbilities: DetailedCharacterAbilities,
    private readonly characterClasses: DetailedCharacterClasses,
  ) {}

  static getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(NAVIGATABLE_PATHS);
  }

  static generateTargetPaths(saves: RulesetSave[], kind: "modifier" | "requirement"): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const save of saves) {
      const normalizedSaveName = stripSeparators(save.name);

      for (const subPath of NAVIGATABLE_PATHS) {
        if ("requirementOnly" in subPath && subPath.requirementOnly && kind === "modifier") continue;
        paths.push({
          path: `saves.${normalizedSaveName}.${subPath.path}`,
          category: "saves",
          description: subPath.description,
          valueType: subPath.type,
          operators: getNumericOperators(kind),
        });
      }
    }

    paths.push({
      path: "saves.*.misc",
      category: "saves",
      description: "Misc bonus applied to every save",
      groupDescription: kind === "requirement" ? "Any saving throw" : "All saving throws",
      valueType: "number",
      operators: getNumericOperators(kind),
    });

    return paths;
  }

  private readonly detailedCharacterSavingThrows: DetailedCharacterComprehensiveSavingThrows =
    {} as DetailedCharacterComprehensiveSavingThrows;

  initialize(saves: RulesetSave[], rulesetAbilities: RulesetAbility[], klassLevelSaves: KlassLevelSave[]) {
    const abilityNames = new Map(rulesetAbilities.map((a) => [a.id, a.name]));
    const saveBaseValues = new Map<string, number>();
    const classes = this.characterClasses.getClasses();
    for (const klass of Object.values(classes)) {
      const lastLevel = klass.levels.at(-1);
      if (lastLevel) {
        const levelSaves = klassLevelSaves.filter((ls) => ls.klassLevelId === lastLevel.klassLevel.id);
        for (const ls of levelSaves) {
          saveBaseValues.set(ls.saveId, (saveBaseValues.get(ls.saveId) ?? 0) + ls.base);
        }
      }
    }

    for (const save of saves) {
      const normalizedName = stripSeparators(save.name);
      const abilityName = abilityNames.get(save.abilityId) ?? "Unknown";
      const base = saveBaseValues.get(save.id) ?? 0;
      const abilities = this.characterAbilities;

      // The ability's modifier and the total are computed when read, so they follow the abilities and the parts
      this.detailedCharacterSavingThrows[normalizedName] = {
        name: save.name,
        base,
        get ability() {
          return abilities.getAbilityModifier(abilityName);
        },
        misc: 0,
        get total() {
          return this.base + this.ability + this.misc;
        },
      };
    }
  }

  getSavingThrow(savingThrowName: string): DetailedCharacterComprehensiveSavingThrows[string] {
    return this.detailedCharacterSavingThrows[stripSeparators(savingThrowName)];
  }

  getSavingThrows(): DetailedCharacterComprehensiveSavingThrows {
    return this.detailedCharacterSavingThrows;
  }
}
