import type { TargetPath } from "@/shared/customization/target.ts";
import type { KlassLevelSave, RulesetAbility, RulesetSave } from "@/shared/relations.ts";
import { deriveSegmentLabels, stripSeparators } from "@/shared/utils.ts";
import type DetailedCharacterAbilities from "./DetailedCharacterAbilities.ts";
import type DetailedCharacterClasses from "./DetailedCharacterClasses.ts";

const NAVIGATABLE_PATHS = [
  { path: "base", description: "Base save bonus from class levels", type: "number" as const },
  { path: "ability", description: "From key ability modifier", type: "number" as const },
  { path: "misc", description: "From feats, items, and spells", type: "number" as const },
  { path: "total", description: "Final saving throw bonus", type: "number" as const, requirementOnly: true },
];

export type DetailedCharacterComprehensiveSavingThrows = {
  [key: string]: {
    name: string;
    base: number;
    ability: number;
    misc: number;
    total: number;
  };
};

export default class DetailedCharacterSavingThrows {
  static getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(NAVIGATABLE_PATHS);
  }

  static generateTargetPaths(
    saves: RulesetSave[],
    kind: "modifier" | "requirement",
  ): TargetPath[] {
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
          operators: kind === "modifier" ? ["add", "subtract", "multiply", "divide", "set"] : [
            "equal",
            "not_equal",
            "greater_than",
            "less_than",
            "greater_than_or_equal",
            "less_than_or_equal",
          ],
        });
      }
    }

    paths.push({
      path: "saves.*.misc",
      category: "saves",
      description: "Misc bonus applied to every save",
      groupDescription: kind === "requirement" ? "Any saving throw" : "All saving throws",
      valueType: "number",
      operators: kind === "modifier" ? ["add", "subtract", "multiply", "divide", "set"] : [
        "equal",
        "not_equal",
        "greater_than",
        "less_than",
        "greater_than_or_equal",
        "less_than_or_equal",
      ],
    });

    return paths;
  }

  private readonly detailedCharacterSavingThrows: DetailedCharacterComprehensiveSavingThrows =
    {} as DetailedCharacterComprehensiveSavingThrows;
  private readonly saveAbilityNames = new Map<string, string>();

  constructor(
    private readonly characterAbilities: DetailedCharacterAbilities,
    private readonly characterClasses: DetailedCharacterClasses,
  ) {}

  initialize(
    saves: RulesetSave[],
    rulesetAbilities: RulesetAbility[],
    klassLevelSaves: KlassLevelSave[],
  ) {
    const abilityNames = new Map(rulesetAbilities.map((a) => [a.id, a.name]));
    const saveBaseValues = new Map<string, number>();
    const classes = this.characterClasses.getClasses();
    for (const klass of Object.values(classes)) {
      const lastLevel = klass.levels.at(-1);
      if (lastLevel) {
        const levelSaves = klassLevelSaves.filter(
          (ls) => ls.klassLevelId === lastLevel.klassLevel.id,
        );
        for (const ls of levelSaves) {
          saveBaseValues.set(ls.saveId, (saveBaseValues.get(ls.saveId) ?? 0) + ls.base);
        }
      }
    }

    for (const save of saves) {
      const normalizedName = stripSeparators(save.name);
      const abilityName = abilityNames.get(save.abilityId) ?? "Unknown";
      const base = saveBaseValues.get(save.id) ?? 0;
      const abilityMod = this.characterAbilities.getAbilityModifier(abilityName);

      this.saveAbilityNames.set(normalizedName, abilityName);
      this.detailedCharacterSavingThrows[normalizedName] = {
        name: save.name,
        base,
        ability: abilityMod,
        misc: 0,
        total: base + abilityMod,
      };
    }
  }

  getSavingThrows(): DetailedCharacterComprehensiveSavingThrows {
    return this.detailedCharacterSavingThrows;
  }

  getSavingThrow(
    savingThrowName: string,
  ): DetailedCharacterComprehensiveSavingThrows[string] {
    return this.detailedCharacterSavingThrows[stripSeparators(savingThrowName)];
  }

  refreshAbilityModifiers() {
    for (const [saveName, save] of Object.entries(this.detailedCharacterSavingThrows)) {
      const abilityName = this.saveAbilityNames.get(saveName);
      if (abilityName) {
        save.ability = this.characterAbilities.getAbilityModifier(abilityName);
      }
    }
    this.updateTotals();
  }

  updateTotals() {
    for (const savingThrowName of Object.keys(this.detailedCharacterSavingThrows)) {
      this.updateTotal(savingThrowName);
    }
  }

  updateTotal(savingThrowName: string) {
    const savingThrow = this.detailedCharacterSavingThrows[savingThrowName];
    savingThrow.total = savingThrow.base + savingThrow.ability + savingThrow.misc;
  }
}
