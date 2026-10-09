import type AbilitiesComponent from "@/engine/rulesets/dnd3.5/model/abilities/AbilitiesComponent.ts";
import type ClassesComponent from "@/engine/rulesets/dnd3.5/model/classes/ClassesComponent.ts";
import type { KlassLevelSave, RulesetAbility, RulesetSave } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

type SavingThrowsData = {
  [key: string]: {
    readonly ability: number;
    base: number;
    misc: number;
    name: string;
    readonly total: number;
  };
};

export default class SavingThrowsComponent {
  constructor(
    private readonly abilities: AbilitiesComponent,
    private readonly classes: ClassesComponent,
  ) {}

  private readonly savingThrows: SavingThrowsData = {} as SavingThrowsData;

  getSavingThrow(savingThrowName: string): SavingThrowsData[string] {
    return this.savingThrows[stripSeparators(savingThrowName)];
  }

  getSavingThrows(): SavingThrowsData {
    return this.savingThrows;
  }

  initialize(saves: RulesetSave[], rulesetAbilities: RulesetAbility[], klassLevelSaves: KlassLevelSave[]) {
    const abilityNames = new Map(rulesetAbilities.map((a) => [a.id, a.name]));
    const saveBaseValues = new Map<string, number>();
    const classes = this.classes.getClasses();
    for (const klass of Object.values(classes)) {
      const lastLevel = klass.levels.at(-1);
      if (lastLevel) {
        const levelSaves = klassLevelSaves.filter((ls) => ls.klassLevelId === lastLevel.klassLevel.id);
        for (const ls of levelSaves) saveBaseValues.set(ls.saveId, (saveBaseValues.get(ls.saveId) ?? 0) + ls.base);
      }
    }

    for (const save of saves) {
      const normalizedName = stripSeparators(save.name);
      const abilityName = abilityNames.get(save.abilityId) ?? "Unknown";
      const base = saveBaseValues.get(save.id) ?? 0;
      const abilities = this.abilities;

      // The ability's modifier and the total are computed when read, so they follow the abilities and the parts
      this.savingThrows[normalizedName] = {
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
