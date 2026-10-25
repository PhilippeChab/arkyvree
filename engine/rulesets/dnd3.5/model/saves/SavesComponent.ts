import { CharacterComponent } from "@/engine/core/character/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type AbilitiesComponent from "@/engine/rulesets/dnd3.5/model/abilities/AbilitiesComponent.ts";
import type ClassesComponent from "@/engine/rulesets/dnd3.5/model/classes/ClassesComponent.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { stripSeparators } from "@/shared/text.ts";

interface SavesData {
  [key: string]: {
    readonly ability: number;
    base: number;
    misc: number;
    name: string;
    readonly total: number;
  };
}

/** A character's saves: each one's base from its classes' levels and its ability's modifier, counted when read. */
export default class SavesComponent extends CharacterComponent<LoadedCharacterData> {
  constructor(
    private readonly abilities: AbilitiesComponent,
    private readonly classes: ClassesComponent,
  ) {
    super();
  }

  private readonly saves: SavesData = {} as SavesData;

  /** Each of the ruleset's saves: its base, the sum of each class's last level's, and its ability's modifier. */
  override initialize({ klassLevelSaves }: Pick<LoadedCharacterData, "klassLevelSaves">, { rulesetData }: RulesetView) {
    const saveBaseValues = new Map<string, number>();
    const classes = this.classes.getClasses();
    for (const klass of Object.values(classes)) {
      const lastLevel = klass.levels.at(-1);
      if (lastLevel) {
        const levelSaves = klassLevelSaves.filter((link) => link.fromId === lastLevel.klassLevel.id);
        for (const link of levelSaves)
          saveBaseValues.set(link.toId, (saveBaseValues.get(link.toId) ?? 0) + (link.amount ?? 0));
      }
    }

    for (const save of Dnd35View.of(rulesetData).saves) {
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

  getSave(saveName: string): SavesData[string] {
    return this.saves[stripSeparators(saveName)];
  }

  getSaves(): SavesData {
    return this.saves;
  }
}
