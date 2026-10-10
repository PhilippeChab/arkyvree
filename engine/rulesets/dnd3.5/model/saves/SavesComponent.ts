import type AbilitiesComponent from "@/engine/rulesets/dnd3.5/model/abilities/AbilitiesComponent.ts";
import type ClassesComponent from "@/engine/rulesets/dnd3.5/model/classes/ClassesComponent.ts";
import type { KlassLevelSave, RulesetSave } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

type SavesData = {
  [key: string]: {
    readonly ability: number;
    base: number;
    misc: number;
    name: string;
    readonly total: number;
  };
};

export default class SavesComponent {
  constructor(
    private readonly abilities: AbilitiesComponent,
    private readonly classes: ClassesComponent,
  ) {}

  private readonly saves: SavesData = {} as SavesData;

  getSave(saveName: string): SavesData[string] {
    return this.saves[stripSeparators(saveName)];
  }

  getSaves(): SavesData {
    return this.saves;
  }

  initialize(rulesetSaves: RulesetSave[], klassLevelSaves: KlassLevelSave[]) {
    const saveBaseValues = new Map<string, number>();
    const classes = this.classes.getClasses();
    for (const klass of Object.values(classes)) {
      const lastLevel = klass.levels.at(-1);
      if (lastLevel) {
        const levelSaves = klassLevelSaves.filter((ls) => ls.klassLevelId === lastLevel.klassLevel.id);
        for (const ls of levelSaves) saveBaseValues.set(ls.saveId, (saveBaseValues.get(ls.saveId) ?? 0) + ls.base);
      }
    }

    for (const save of rulesetSaves) {
      const normalizedName = stripSeparators(save.name);
      const abilityName = this.abilities.getAbilityName(save.abilityId) ?? "";
      const base = saveBaseValues.get(save.id) ?? 0;
      const abilities = this.abilities;

      // The ability's modifier and the total are computed when read, so they follow the abilities and the parts
      this.saves[normalizedName] = {
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
