import { CharacterComponent } from "@/engine/core/character/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type AbilitiesComponent from "@/engine/rulesets/dnd5.2/model/abilities/AbilitiesComponent.ts";
import type ClassesComponent from "@/engine/rulesets/dnd5.2/model/classes/ClassesComponent.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd5.2/model/loading/DetailedCharacterDataLoader.ts";
import Dnd52View from "@/engine/rulesets/dnd5.2/view/Dnd52View.ts";
import { stripSeparators } from "@/shared/text.ts";

interface SavesData {
  [key: string]: {
    readonly ability: number;
    misc: number;
    name: string;
    readonly proficiency: number;
    proficient: boolean;
    readonly total: number;
  };
}

/**
 * A character's saving throws, one for each ability: each one's ability modifier, its Proficiency Bonus when the
 * character is proficient in it (a feat sets it: its first class's starting proficiencies give two), and misc, counted
 * when read.
 */
export default class SavesComponent extends CharacterComponent<LoadedCharacterData> {
  constructor(
    private readonly abilities: AbilitiesComponent,
    private readonly classes: ClassesComponent,
  ) {
    super();
  }

  private readonly saves: SavesData = {} as SavesData;

  /** Each of the ruleset's saves, its ability's modifier and its proficiency counted when read. */
  override initialize(_data: LoadedCharacterData, { rulesetData }: RulesetView) {
    const { abilities, classes } = this;
    for (const save of Dnd52View.of(rulesetData).saves) {
      const abilityName = (save.links.keyAbility && abilities.getAbilityName(save.links.keyAbility)) ?? "";
      // What's computed is computed when read, so it follows the abilities, the level and the parts
      this.saves[stripSeparators(save.name)] = {
        name: save.name,
        get ability() {
          return abilities.getAbilityModifier(abilityName);
        },
        misc: 0,
        proficient: false,
        get proficiency() {
          return this.proficient ? classes.getProficiencyBonus() : 0;
        },
        get total() {
          return this.ability + this.proficiency + this.misc;
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
