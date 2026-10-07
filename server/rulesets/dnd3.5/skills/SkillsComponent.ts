import type AbilitiesComponent from "@/server/rulesets/dnd3.5/abilities/AbilitiesComponent.ts";
import type ClassesComponent from "@/server/rulesets/dnd3.5/classes/ClassesComponent.ts";
import type { ArmorsData } from "@/server/rulesets/dnd3.5/combat/ArmorsComponent.ts";
import type { ShieldsData } from "@/server/rulesets/dnd3.5/combat/ShieldsComponent.ts";
import { SIZE_HIDE_MOD } from "@/server/rulesets/dnd3.5/constants.ts";
import type { SkillFlags } from "@/server/rulesets/engine/module/index.ts";
import type { ValidationIssue } from "@/server/rulesets/engine/types.ts";
import { computeLevelSkillPoints } from "@/shared/dnd3.5/skills.ts";
import { type RulesetAbility, type Skill } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

type SkillsData = {
  [key: string]: {
    name: string;
    description?: string | null;
    innate: boolean;
    trained: boolean;
    rank: number; // Rank from levels
    readonly ability: number; // Bonus from ability modifier
    readonly weight: number; // Armor check penalty, from armor, shield and load
    size: number; // Size modifier (Hide only)
    misc: number; // Misc from items
    readonly total: number; // Total from everything
  };
};

/**
 * Whether the skill `name` is a subtype of one of `names`: a subtype names itself "<base> (<variant>)", and a
 * user-authored ruleset can nest them ("Knowledge (Arcana) (Ancient)"), so every " (" is a possible base's end.
 */
export function isSkillSubtypeOf(name: string, names: Set<string>): boolean {
  for (let idx = name.indexOf(" ("); idx > 0; idx = name.indexOf(" (", idx + 1))
    if (names.has(name.slice(0, idx))) return true;

  return false;
}

export default class SkillsComponent {
  constructor(
    private readonly abilities: AbilitiesComponent,
    private readonly classes: ClassesComponent,
  ) {}

  private readonly skillBudget = { total: 0, available: 0, spent: 0, perlevel: 0 };

  private readonly innateSkillIds: Set<string> = new Set<string>();

  private readonly rankBySkillId: Map<string, number> = new Map<string, number>();

  /** Each skill's key ability, by the skill's slug. */
  private readonly abilityNameBySkill = new Map<string, string>();

  private readonly skills: SkillsData = {} as SkillsData;

  private characterArmors: { getArmors(): ArmorsData } | null = null;

  private characterShields: { getShields(): ShieldsData } | null = null;

  private characterEncumbrance: {
    getEncumbrance(): { checkpenalty: number };
  } | null = null;

  private skillPointRulesetAbilities: RulesetAbility[] = [];

  private skillPointAbilityId: string | null = null;

  private skillPointKlassLevelProperties: Map<string, { bab: number; skills: number }> = new Map();

  private raceSize = "Medium";

  /** The armor check penalty a skill armor weighs on takes: the worse of the armor and shield's and the load's. */
  private armorCheckPenalty(): number {
    let armorPenalty = 0;

    if (this.characterArmors) {
      const uniqueArmors = new Set(Object.values(this.characterArmors.getArmors()));
      for (const armor of uniqueArmors) armorPenalty += armor.checkpenalty;
    }

    if (this.characterShields) {
      const uniqueShields = new Set(Object.values(this.characterShields.getShields()));
      for (const shield of uniqueShields) armorPenalty += shield.checkpenalty;
    }

    // D&D 3.5: use the worse (more negative) of armor+shield penalty vs encumbrance penalty
    const encumbrancePenalty = this.characterEncumbrance ? this.characterEncumbrance.getEncumbrance().checkpenalty : 0;
    return Math.abs(Math.min(armorPenalty, encumbrancePenalty));
  }

  /** The modifier of the ruleset's skill point ability, its misc bonuses aside: 0 when the ruleset names none. */
  private getSkillPointAbilityModifier(): number {
    const abilityName = this.skillPointAbilityId
      ? (this.skillPointRulesetAbilities.find((a) => a.id === this.skillPointAbilityId)?.name ?? null)
      : null;
    return abilityName ? this.abilities.getAbilityModifierExcludingMisc(abilityName) : 0;
  }

  /** Ranks a bonded creature's hit dice past its stat block's give a skill. */
  addRanks(skillName: string, ranks: number): void {
    const skill = this.skills[stripSeparators(skillName)];
    if (!skill || ranks === 0) return;
    skill.rank += ranks;
    skill.trained = true;
  }

  /** Raises each skill's ranks to these, by skill slug, where they're better: a familiar's to its master's. */
  applyBetterRanks(ranks: Record<string, number>): void {
    for (const [slug, rank] of Object.entries(ranks)) {
      const skill = this.skills[slug];
      if (!skill || rank <= skill.rank) continue;
      skill.rank = rank;
      skill.trained = true;
    }
  }

  /** Enriches ruleset skills with character-specific class/rank data for level-up UI. */
  getEnrichedSkills<T extends { id: string; name: string }>(
    allSkills: T[],
    classSkillIds: Set<string>,
  ): (T & { isClassSkill: boolean; isCurrentClassSkill: boolean; currentRank: number })[] {
    return allSkills.map((skill) => {
      const skillData = this.skills[stripSeparators(skill.name)];
      return {
        ...skill,
        isClassSkill: skillData?.innate ?? classSkillIds.has(skill.id),
        isCurrentClassSkill: classSkillIds.has(skill.id),
        currentRank: skillData?.rank || 0,
      };
    });
  }

  /** A level's points per level, before the minimum: its class's and the skill point ability's modifier. */
  getLevelPointsPerLevel(classSkillPoints: number): number {
    return classSkillPoints + this.getSkillPointAbilityModifier();
  }

  /** The skill points a level gives: its class's and the skill point ability's modifier, and any bonus per level. */
  getLevelSkillPoints(classSkillPoints: number, isFirstCharacterLevel: boolean): number {
    return computeLevelSkillPoints(
      this.getLevelPointsPerLevel(classSkillPoints),
      this.skillBudget.perlevel,
      isFirstCharacterLevel,
    );
  }

  getSkillBudget() {
    return this.skillBudget;
  }

  /**
   * Each level's points per level before the minimum, in the order the character took them (the first is its first
   * level), and the bonus each level adds: what the level-up wizard recomputes the points from when it raises the
   * skill point ability.
   */
  getSkillPointBases(): { pointsPerLevel: number[]; bonusPerLevel: number } {
    const levels = Object.values(this.classes.getClasses())
      .flatMap((klass) => klass.levels)
      .sort((a, b) => a.characterLevel.position - b.characterLevel.position);
    return {
      pointsPerLevel: levels.map((level) =>
        this.getLevelPointsPerLevel(this.skillPointKlassLevelProperties.get(level.klassLevel.id)?.skills ?? 0),
      ),
      bonusPerLevel: this.skillBudget.perlevel,
    };
  }

  getSkills() {
    return this.skills;
  }

  getValidationIssues(characterLevel: number): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const classSkillMaxRank = characterLevel + 3;
    const crossClassMaxRank = (characterLevel + 3) / 2;

    for (const [, skill] of Object.entries(this.skills)) {
      if (skill.rank <= 0) continue;
      const maxRank = skill.innate ? classSkillMaxRank : crossClassMaxRank;
      if (skill.rank > maxRank) {
        issues.push({
          category: "skills",
          message: `${skill.name}: rank ${skill.rank} exceeds ${skill.innate ? "class" : "cross-class"} max of ${maxRank}`,
        });
      }
    }

    return issues;
  }

  initialize(
    rulesetSkills: Skill[],
    rulesetAbilities: RulesetAbility[],
    raceSize: string,
    skillProperties?: Map<string, SkillFlags>,
  ) {
    this.raceSize = raceSize;
    const classes = this.classes.getClasses();

    // Build ability ID -> name lookup
    const abilityNameById = new Map<string, string>();
    for (const a of rulesetAbilities) abilityNameById.set(a.id, a.name);

    // Build skill ID → name lookup from ruleset skills
    const skillNameById = new Map<string, string>();
    for (const s of rulesetSkills) skillNameById.set(s.id, s.name);

    // Collect all class skill IDs + mark subtypes as innate
    // (e.g., "Craft (Armorsmithing)" is innate if "Craft" is a class skill)
    const allKlassSkillNames = new Set<string>();
    const allKlassSkillIds = Object.values(classes).flatMap((klass) =>
      klass.klassSkills.flatMap((klassSkill) => klassSkill.skillId),
    );
    for (const skillId of allKlassSkillIds) {
      this.innateSkillIds.add(skillId);
      const name = skillNameById.get(skillId);
      if (name) allKlassSkillNames.add(name);
    }
    // Also mark subtypes of class skills as innate.
    for (const skill of rulesetSkills) {
      if (this.innateSkillIds.has(skill.id)) continue;
      if (isSkillSubtypeOf(skill.name, allKlassSkillNames)) this.innateSkillIds.add(skill.id);
    }

    // Convert stored points to actual ranks per class-level.
    // Points spent on a class skill (for that class) convert 1:1.
    // Points spent on a cross-class skill convert at 0.5 ranks per point.
    for (const klass of Object.values(classes)) {
      const klassSkillIds = new Set(klass.klassSkills.map((ks) => ks.skillId));
      const klassSkillNames = new Set(
        klass.klassSkills.map((ks) => skillNameById.get(ks.skillId)).filter((n): n is string => !!n),
      );

      for (const level of klass.levels) {
        for (const skill of level.skills) {
          const isClassSkillById = klassSkillIds.has(skill.id);
          const isClassSkillByName = !isClassSkillById && isSkillSubtypeOf(skill.name, klassSkillNames);
          const isClassSkillForKlass = isClassSkillById || isClassSkillByName;
          const ranksGained = isClassSkillForKlass ? skill.rank : skill.rank / 2;
          const current = this.rankBySkillId.get(skill.id) ?? 0;
          this.rankBySkillId.set(skill.id, current + ranksGained);
        }
      }
    }

    for (const skill of rulesetSkills) {
      const props = skillProperties?.get(skill.id);
      const usableWithoutTraining = props?.usableWithoutTraining ?? true;
      // How many times over the skill takes the armor check penalty: none when armor doesn't weigh on it
      const checkPenaltyMultiplier = props?.impactedByWeight ? (props.checkPenaltyMultiplier ?? 1) : 0;
      const invested = this.rankBySkillId.get(skill.id) ?? 0;
      const abilityName = abilityNameById.get(skill.primaryAbilityId) ?? "";
      this.abilityNameBySkill.set(stripSeparators(skill.name), abilityName);
      const abilities = this.abilities;
      const armorCheckPenalty = () => this.armorCheckPenalty();

      // The ability's modifier, the armor check penalty and the total are computed when read: they follow the
      // abilities, the armor and the load, and the parts
      this.skills[stripSeparators(skill.name)] = {
        name: skill.name,
        description: skill.description ?? undefined,
        trained: usableWithoutTraining ? true : invested !== 0,
        innate: this.innateSkillIds.has(skill.id),
        rank: invested,
        get ability() {
          return abilityName ? abilities.getAbilityModifier(abilityName) : 0;
        },
        get weight() {
          return checkPenaltyMultiplier === 0 ? 0 : armorCheckPenalty() * checkPenaltyMultiplier;
        },
        size: skill.name === "Hide" ? (SIZE_HIDE_MOD[this.raceSize] ?? 0) : 0,
        misc: 0,
        get total() {
          return this.rank + this.ability + this.size + this.misc - this.weight;
        },
      };
    }
  }

  setArmorSources(armors: { getArmors(): ArmorsData }, shields: { getShields(): ShieldsData }) {
    this.characterArmors = armors;
    this.characterShields = shields;
  }

  setEncumbranceSource(encumbrance: { getEncumbrance(): { checkpenalty: number } }) {
    this.characterEncumbrance = encumbrance;
  }

  setSkillPointDependencies(
    rulesetAbilities: RulesetAbility[],
    skillPointAbilityId: string | null,
    klassLevelProperties: Map<string, { bab: number; skills: number }>,
  ) {
    this.skillPointRulesetAbilities = rulesetAbilities;
    this.skillPointAbilityId = skillPointAbilityId;
    this.skillPointKlassLevelProperties = klassLevelProperties;
  }

  /**
   * A bonded creature's skill as its stat block lists it: its `ranks` (a familiar's, which its master's may better),
   * and the total less those, the ability's base modifier and the size, as misc. The ability's part stays live: a
   * raised ability (a companion's advancement, an item) raises the total.
   */
  setStatBlockTotal(skillName: string, total: number, ranks = 0): void {
    const slug = stripSeparators(skillName);
    const skill = this.skills[slug];
    if (!skill) return;
    const abilityName = this.abilityNameBySkill.get(slug);
    const ability = abilityName ? this.abilities.getAbilityModifierExcludingMisc(abilityName) : 0;
    skill.rank = ranks;
    skill.misc = total - ability - skill.size - ranks;
    skill.trained = total > 0;
  }

  updateAvailables() {
    this.updateSkillPointTotals();
  }

  updateSkillPointTotals() {
    const classes = this.classes.getClasses();

    // Compute spent from actual skill ranks
    const spent = Object.values(classes).reduce(
      (acc, klass) =>
        acc + klass.levels.reduce((acc, level) => acc + level.skills.reduce((acc, skill) => acc + skill.rank, 0), 0),
      0,
    );

    const { pointsPerLevel, bonusPerLevel } = this.getSkillPointBases();
    const total = pointsPerLevel.reduce(
      (acc, points, index) => acc + computeLevelSkillPoints(points, bonusPerLevel, index === 0),
      0,
    );

    this.skillBudget.total = total;
    this.skillBudget.spent = spent;
    this.skillBudget.available = total - spent;
  }
}
