import type AbilitiesComponent from "@/server/rulesets/dnd3.5/abilities/AbilitiesComponent.ts";
import type ClassesComponent from "@/server/rulesets/dnd3.5/classes/ClassesComponent.ts";
import type { KlassLevelSave, RulesetAbility, RulesetSave } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

type DetailedCharacterComprehensiveSavingThrows = {
  [key: string]: {
    name: string;
    base: number;
    readonly ability: number;
    misc: number;
    readonly total: number;
  };
};

export default class SavingThrowsComponent {
  constructor(
    private readonly characterAbilities: AbilitiesComponent,
    private readonly characterClasses: ClassesComponent,
  ) {}

  private readonly detailedCharacterSavingThrows: DetailedCharacterComprehensiveSavingThrows =
    {} as DetailedCharacterComprehensiveSavingThrows;

  getSavingThrow(savingThrowName: string): DetailedCharacterComprehensiveSavingThrows[string] {
    return this.detailedCharacterSavingThrows[stripSeparators(savingThrowName)];
  }

  getSavingThrows(): DetailedCharacterComprehensiveSavingThrows {
    return this.detailedCharacterSavingThrows;
  }

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
}
