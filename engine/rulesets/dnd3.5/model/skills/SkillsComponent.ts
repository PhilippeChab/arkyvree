import { SKILL_FIELDS, type SkillFieldValues } from "@/engine/rulesets/dnd3.5/entities/skills/fields.ts";
import type AbilitiesComponent from "@/engine/rulesets/dnd3.5/model/abilities/AbilitiesComponent.ts";
import type ClassesComponent from "@/engine/rulesets/dnd3.5/model/classes/ClassesComponent.ts";
import type ArmorsComponent from "@/engine/rulesets/dnd3.5/model/combat/ArmorsComponent.ts";
import type EncumbranceComponent from "@/engine/rulesets/dnd3.5/model/combat/EncumbranceComponent.ts";
import type ShieldsComponent from "@/engine/rulesets/dnd3.5/model/combat/ShieldsComponent.ts";
import type { ValidationIssue } from "@/engine/rulesets/dnd3.5/model/concerns/Validates.ts";
import type IdentityComponent from "@/engine/rulesets/dnd3.5/model/identity/IdentityComponent.ts";
import { SIZE_HIDE_MOD } from "@/engine/rulesets/dnd3.5/rules/sizes.ts";
import SkillRules from "@/engine/rulesets/dnd3.5/rules/SkillRules.ts";
import { type RulesetAbility, type Skill } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

/** The skill points' budget: a level's bonus points, an input, and the points counted from the character's levels. */
type SkillBudget = {
  readonly available: number;
  perlevel: number;
  readonly spent: number;
  readonly total: number;
};

type SkillsData = {
  [key: string]: {
    readonly ability: number; // Bonus from ability modifier
    description?: string | null;
    innate: boolean;
    misc: number; // Misc from items
    name: string;
    rank: number; // Rank from levels
    size: number; // Size modifier (Hide only), which a modifier can add to
    readonly total: number; // Total from everything
    trained: boolean;
    readonly weight: number; // Armor check penalty, from armor, shield and load
  };
};

export default class SkillsComponent {
  constructor(
    private readonly abilities: AbilitiesComponent,
    private readonly classes: ClassesComponent,
    private readonly identity: IdentityComponent,
    private readonly armors: ArmorsComponent,
    private readonly shields: ShieldsComponent,
    private readonly encumbrance: EncumbranceComponent,
  ) {}

  /**
   * Whether the skill `name` is a subtype of one of `names`: a subtype names itself "<base> (<variant>)", and a
   * user-authored ruleset can nest them ("Knowledge (Arcana) (Ancient)"), so every " (" is a possible base's end.
   */
  static isSubtypeOf(name: string, names: Set<string>): boolean {
    for (let idx = name.indexOf(" ("); idx > 0; idx = name.indexOf(" (", idx + 1))
      if (names.has(name.slice(0, idx))) return true;

    return false;
  }

  /** Each skill's key ability, by the skill's slug. */
  private readonly abilityNameBySkill = new Map<string, string>();

  private readonly innateSkillIds: Set<string> = new Set<string>();

  private readonly rankBySkillId: Map<string, number> = new Map<string, number>();

  /**
   * The skill points' budget: a level's bonus points (`perlevel`, a human's) are an input, which a modifier changes; the
   * total, what's left and what's spent are counted when read, from the classes' levels and the skill point ability.
   */
  private readonly skillBudget: SkillBudget = (() => {
    const total = () => this.countTotalPoints();
    const spent = () => this.countSpentPoints();
    return {
      get total() {
        return total();
      },
      get available() {
        return this.total - this.spent;
      },
      get spent() {
        return spent();
      },
      perlevel: 0,
    };
  })();

  private readonly skills: SkillsData = {} as SkillsData;

  private skillPointAbilityId: string | null = null;

  private skillPointKlassLevelProperties: Map<string, { bab: number; skills: number }> = new Map();

  private skillPointRulesetAbilities: RulesetAbility[] = [];

  /** The armor check penalty a skill armor weighs on takes: the worse of the armor and shield's and the load's. */
  private armorCheckPenalty(): number {
    let armorPenalty = 0;

    for (const armor of new Set(Object.values(this.armors.getArmors()))) armorPenalty += armor.checkpenalty;
    for (const shield of new Set(Object.values(this.shields.getShields()))) armorPenalty += shield.checkpenalty;

    // D&D 3.5: use the worse (more negative) of armor+shield penalty vs encumbrance penalty
    const encumbrancePenalty = this.encumbrance.getEncumbrance().checkpenalty;
    return Math.abs(Math.min(armorPenalty, encumbrancePenalty));
  }

  /** The skill points the character's levels spent: their skills' ranks. */
  private countSpentPoints(): number {
    return Object.values(this.classes.getClasses()).reduce(
      (acc, klass) =>
        acc + klass.levels.reduce((acc, level) => acc + level.skills.reduce((acc, skill) => acc + skill.rank, 0), 0),
      0,
    );
  }

  /** The skill points every level gives: its points per level, with the bonus each level adds (`perlevel`). */
  private countTotalPoints(): number {
    const { pointsPerLevel, bonusPerLevel } = this.getSkillPointBases();
    return pointsPerLevel.reduce(
      (acc, points, index) => acc + SkillRules.levelPoints(points, bonusPerLevel, index === 0),
      0,
    );
  }

  /** The modifier of the ruleset's skill point ability, its misc bonuses aside: 0 when the ruleset names none. */
  private getSkillPointAbilityModifier(): number {
    const abilityName = this.skillPointAbilityId
      ? (this.skillPointRulesetAbilities.find((a) => a.id === this.skillPointAbilityId)?.name ?? null)
      : null;
    return abilityName ? this.abilities.getAbilityModifierExcludingMisc(abilityName) : 0;
  }

  /**
   * A skill as the sheet holds it: its ranks and misc are inputs; the ability's modifier, the armor check penalty and
   * the total are computed when read, as they follow the abilities, the armor and the load. A Hide check's size follows
   * the character's, as its identity's race has it, and keeps what a modifier adds to it.
   */
  private newSkill(skill: Skill, abilityName: string, fields: SkillFieldValues): SkillsData[string] {
    const { abilities } = this;
    const armorCheckPenalty = () => this.armorCheckPenalty();
    const raceSize = () => this.identity.getIdentity().physiology.race.size;
    const invested = this.rankBySkillId.get(skill.id) ?? 0;
    // How many times over the skill takes the armor check penalty: none when armor doesn't weigh on it
    const checkPenaltyMultiplier = fields.impactedByWeight ? fields.checkPenaltyMultiplier : 0;
    const sizeOfRace = () => (skill.name === "Hide" ? (SIZE_HIDE_MOD[raceSize()] ?? 0) : 0);
    let sizeBonus = 0;
    return {
      name: skill.name,
      description: skill.description ?? undefined,
      trained: fields.usableWithoutTraining ? true : invested !== 0,
      innate: this.innateSkillIds.has(skill.id),
      rank: invested,
      get ability() {
        return abilityName ? abilities.getAbilityModifier(abilityName) : 0;
      },
      get weight() {
        return checkPenaltyMultiplier === 0 ? 0 : armorCheckPenalty() * checkPenaltyMultiplier;
      },
      get size() {
        return sizeOfRace() + sizeBonus;
      },
      set size(value: number) {
        sizeBonus = value - sizeOfRace();
      },
      misc: 0,
      get total() {
        return this.rank + this.ability + this.size + this.misc - this.weight;
      },
    };
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
  ): (T & { currentRank: number; isClassSkill: boolean; isCurrentClassSkill: boolean })[] {
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

  getSkillBudget(): SkillBudget {
    return this.skillBudget;
  }

  /**
   * Each level's points per level before the minimum, in the order the character took them (the first is its first
   * level), and the bonus each level adds: what the level-up wizard recomputes the points from when it raises the
   * skill point ability.
   */
  getSkillPointBases(): { bonusPerLevel: number; pointsPerLevel: number[] } {
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

  getSkills(): SkillsData {
    return this.skills;
  }

  getValidationIssues(characterLevel: number): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    for (const [, skill] of Object.entries(this.skills)) {
      if (skill.rank <= 0) continue;
      const maxRank = SkillRules.maxRank(characterLevel, skill.innate);
      if (skill.rank > maxRank) {
        issues.push({
          category: "skills",
          message: `${skill.name}: rank ${skill.rank} exceeds ${skill.innate ? "class" : "cross-class"} max of ${maxRank}`,
        });
      }
    }

    return issues;
  }

  /**
   * Each of the ruleset's skills (`rulesetSkills`), with the fields its properties hold (`skillFields`) and the ranks the
   * character's class levels put in it; and the skill points' budget, from the ruleset's skill point ability
   * (`skillPointAbilityId`) and each class level's points (`klassLevelProperties`).
   */
  initialize(
    rulesetSkills: Skill[],
    rulesetAbilities: RulesetAbility[],
    skillPointAbilityId: string | null,
    klassLevelProperties: Map<string, { bab: number; skills: number }>,
    skillFields: Map<string, SkillFieldValues>,
  ) {
    this.skillPointRulesetAbilities = rulesetAbilities;
    this.skillPointAbilityId = skillPointAbilityId;
    this.skillPointKlassLevelProperties = klassLevelProperties;
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
      if (SkillsComponent.isSubtypeOf(skill.name, allKlassSkillNames)) this.innateSkillIds.add(skill.id);
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
          const isClassSkillByName = !isClassSkillById && SkillsComponent.isSubtypeOf(skill.name, klassSkillNames);
          const isClassSkillForKlass = isClassSkillById || isClassSkillByName;
          const ranksGained = SkillRules.ranksFor(skill.rank, isClassSkillForKlass);
          const current = this.rankBySkillId.get(skill.id) ?? 0;
          this.rankBySkillId.set(skill.id, current + ranksGained);
        }
      }
    }

    for (const skill of rulesetSkills) {
      const abilityName = abilityNameById.get(skill.primaryAbilityId) ?? "";
      this.abilityNameBySkill.set(stripSeparators(skill.name), abilityName);
      // A skill without its fields' rows has their defaults: armor doesn't weigh on it, and it needs training
      const fields = skillFields.get(skill.id) ?? SKILL_FIELDS.defaults;
      this.skills[stripSeparators(skill.name)] = this.newSkill(skill, abilityName, fields);
    }
  }

  /**
   * A bonded creature's skill as its stat block lists it: its `ranks` (a familiar's, which its master's may better),
   * and the total less those, the ability's base modifier, the size and what the stat block's feats add (`featBonus`,
   * which those feats add back), as misc. The ability's part stays live: a raised ability (a companion's advancement,
   * an item) raises the total.
   */
  setStatBlockTotal(skillName: string, total: number, ranks = 0, featBonus = 0): void {
    const slug = stripSeparators(skillName);
    const skill = this.skills[slug];
    if (!skill) return;
    const abilityName = this.abilityNameBySkill.get(slug);
    const ability = abilityName ? this.abilities.getAbilityModifierExcludingMisc(abilityName) : 0;
    skill.rank = ranks;
    skill.misc = total - ability - skill.size - ranks - featBonus;
    skill.trained = total > 0;
  }
}
