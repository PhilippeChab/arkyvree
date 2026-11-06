import { CharacterComponent } from "@/engine/core/character/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type AbilitiesComponent from "@/engine/rulesets/dnd5.2/model/abilities/AbilitiesComponent.ts";
import type ClassesComponent from "@/engine/rulesets/dnd5.2/model/classes/ClassesComponent.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd5.2/model/loading/DetailedCharacterDataLoader.ts";
import Dnd52View from "@/engine/rulesets/dnd5.2/view/Dnd52View.ts";
import { stripSeparators } from "@/shared/text.ts";
import { EXPERTISE_MULTIPLIER } from "@/vocabulary/dnd5.2/skills.ts";

/** A skill as the sheet counts it. */
interface SkillData {
  readonly ability: number;
  abilityName: string;
  expertise: boolean;
  halfproficient: boolean;
  misc: number;
  name: string;
  proficient: boolean;
  readonly proficiency: number;
  readonly total: number;
}

interface SkillsData {
  [key: string]: SkillData;
}

/**
 * A character's skills: each one's ability modifier, the Proficiency Bonus it adds (all of it proficient, twice with
 * Expertise, half rounded down when its Jack of All Trades reaches an unproficient one; a feat sets each), and misc,
 * counted when read. A skill takes no ranks.
 */
export default class SkillsComponent extends CharacterComponent<LoadedCharacterData> {
  constructor(
    private readonly abilities: AbilitiesComponent,
    private readonly classes: ClassesComponent,
  ) {
    super();
  }

  private readonly skills: SkillsData = {};

  /** Each of the ruleset's skills, its ability's modifier and its proficiency counted when read. */
  override initialize(_data: LoadedCharacterData, { rulesetData }: RulesetView) {
    const { abilities, classes } = this;
    for (const skill of Dnd52View.of(rulesetData).skills) {
      const abilityName = (skill.links.keyAbility && abilities.getAbilityName(skill.links.keyAbility)) ?? "";
      // What's computed is computed when read, so it follows the abilities, the level and the parts
      this.skills[stripSeparators(skill.name)] = {
        name: skill.name,
        abilityName,
        get ability() {
          return abilities.getAbilityModifier(abilityName);
        },
        expertise: false,
        halfproficient: false,
        misc: 0,
        proficient: false,
        get proficiency() {
          const bonus = classes.getProficiencyBonus();
          if (this.proficient) return this.expertise ? bonus * EXPERTISE_MULTIPLIER : bonus;
          return this.halfproficient ? Math.floor(bonus / 2) : 0;
        },
        get total() {
          return this.ability + this.proficiency + this.misc;
        },
      };
    }
  }

  /** A skill, by its name, as the sheet counts it: none for a skill the ruleset doesn't have. */
  getSkill(skillName: string): SkillData | undefined {
    return this.skills[stripSeparators(skillName)];
  }

  getSkills(): SkillsData {
    return this.skills;
  }
}
