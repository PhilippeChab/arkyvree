import type { ValidationIssue } from "@/server/rulesets/AbstractDetailedCharacter.ts";
import { SIZE_HIDE_MOD } from "@/server/rulesets/constants.ts";
import type { ArmorsData } from "@/server/rulesets/dnd3.5/DetailedCharacterArmors.ts";
import type { ShieldsData } from "@/server/rulesets/dnd3.5/DetailedCharacterShields.ts";
import type DetailedCharacterAbilities from "@/server/rulesets/universal/DetailedCharacterAbilities.ts";
import type DetailedCharacterClasses from "@/server/rulesets/universal/DetailedCharacterClasses.ts";
import { deriveSegmentLabels, type TargetPath } from "@/shared/customization/target.ts";
import { type RulesetAbility, type Skill } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

const NAVIGATABLE_PATHS = [
  { path: "rank", description: "Total ranks invested", type: "number" as const },
  { path: "ability", description: "From key ability modifier", type: "number" as const },
  { path: "weight", description: "Armor check penalty (ACP)", type: "number" as const },
  { path: "size", description: "Size modifier (Hide only)", type: "number" as const },
  { path: "misc", description: "From feats, items, and spells", type: "number" as const },
  { path: "total", description: "Final skill check bonus", type: "number" as const, requirementOnly: true },
  { path: "trained", description: "Whether at least 1 rank is invested", type: "boolean" as const },
  { path: "innate", description: "Whether skill is a class skill", type: "boolean" as const },
];

type DetailedCharacterComprehensiveSkills = {
  [key: string]: {
    name: string;
    description?: string | null;
    innate: boolean;
    trained: boolean;
    rank: number; // Rank from levels
    ability: number; // Bonus from ability modifier
    weight: number; // Weight from items
    size: number; // Size modifier (Hide only)
    misc: number; // Misc from items
    total: number; // Total from everything
  };
};

/**
 * Whether the skill `name` is a subtype of one of `names`: a subtype names itself "<base> (<variant>)", and a
 * user-authored ruleset can nest them ("Knowledge (Arcana) (Ancient)"), so every " (" is a possible base's end.
 */
export function isSkillSubtypeOf(name: string, names: Set<string>): boolean {
  for (let idx = name.indexOf(" ("); idx > 0; idx = name.indexOf(" (", idx + 1)) {
    if (names.has(name.slice(0, idx))) return true;
  }
  return false;
}

export default class DetailedCharacterSkills {
  constructor(
    private readonly characterAbilities: DetailedCharacterAbilities,
    private readonly characterClasses: DetailedCharacterClasses,
  ) {}

  static getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(NAVIGATABLE_PATHS);
  }

  static generateTargetPaths(skills: Skill[], kind: "modifier" | "requirement"): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const skill of skills) {
      const normalizedSkillName = stripSeparators(skill.name);

      for (const subPath of NAVIGATABLE_PATHS) {
        if ("requirementOnly" in subPath && subPath.requirementOnly && kind === "modifier") continue;
        paths.push({
          path: `skills.${normalizedSkillName}.${subPath.path}`,
          category: "skills",
          description: subPath.description,
          valueType: subPath.type,
          operators:
            kind === "modifier"
              ? subPath.type === "boolean"
                ? ["set"]
                : ["add", "subtract", "multiply", "divide", "set"]
              : subPath.type === "boolean"
                ? ["equal", "not_equal"]
                : ["equal", "not_equal", "greater_than", "less_than", "greater_than_or_equal", "less_than_or_equal"],
        });
      }
    }

    paths.push({
      path: "skills.*.misc",
      category: "skills",
      description: "Misc bonus applied to every skill",
      groupDescription: kind === "requirement" ? "Any skill" : "All skills",
      valueType: "number",
      operators:
        kind === "modifier"
          ? ["add", "subtract", "multiply", "divide", "set"]
          : ["equal", "not_equal", "greater_than", "less_than", "greater_than_or_equal", "less_than_or_equal"],
    });

    return paths;
  }

  private readonly skillBudget = { total: 0, available: 0, spent: 0, perlevel: 0 };

  private readonly innateSkillIds: Set<string> = new Set<string>();

  private readonly rankBySkillId: Map<string, number> = new Map<string, number>();

  private readonly detailedCharacterSkills: DetailedCharacterComprehensiveSkills =
    {} as DetailedCharacterComprehensiveSkills;

  private readonly weightAffectedSkills: Set<string> = new Set<string>();

  private readonly skillAbilityNames = new Map<string, string>();

  private characterArmors: { getArmors(): ArmorsData } | null = null;

  private characterShields: { getShields(): ShieldsData } | null = null;

  private characterEncumbrance: {
    getEncumbrance(): { checkpenalty: number };
  } | null = null;

  private skillPointRulesetAbilities: RulesetAbility[] = [];

  private skillPointAbilityId: string | null = null;

  private skillPointKlassLevelProperties: Map<string, { bab: number; skills: number }> = new Map();

  private raceSize = "Medium";

  // ── Private methods ─────────────────────────────────────────────
  private recalculateArmorCheckPenalty() {
    let armorPenalty = 0;

    if (this.characterArmors) {
      const uniqueArmors = new Set(Object.values(this.characterArmors.getArmors()));
      for (const armor of uniqueArmors) {
        armorPenalty += armor.checkpenalty;
      }
    }

    if (this.characterShields) {
      const uniqueShields = new Set(Object.values(this.characterShields.getShields()));
      for (const shield of uniqueShields) {
        armorPenalty += shield.checkpenalty;
      }
    }

    // D&D 3.5: use the worse (more negative) of armor+shield penalty vs encumbrance penalty
    const encumbrancePenalty = this.characterEncumbrance ? this.characterEncumbrance.getEncumbrance().checkpenalty : 0;
    const effectivePenalty = Math.min(armorPenalty, encumbrancePenalty);
    const weight = Math.abs(effectivePenalty);

    for (const skillName of this.weightAffectedSkills) {
      const skill = this.detailedCharacterSkills[skillName];
      if (skill) {
        skill.weight = weight;
      }
    }
  }

  initialize(
    rulesetSkills: Skill[],
    rulesetAbilities: RulesetAbility[],
    raceSize: string,
    skillProperties?: Map<string, { impactedByWeight: boolean; usableWithoutTraining: boolean }>,
  ) {
    this.raceSize = raceSize;
    const classes = this.characterClasses.getClasses();

    // Build ability ID -> name lookup
    const abilityNameById = new Map<string, string>();
    for (const a of rulesetAbilities) {
      abilityNameById.set(a.id, a.name);
    }

    // Build skill ID → name lookup from ruleset skills
    const skillNameById = new Map<string, string>();
    for (const s of rulesetSkills) {
      skillNameById.set(s.id, s.name);
    }

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
      if (isSkillSubtypeOf(skill.name, allKlassSkillNames)) {
        this.innateSkillIds.add(skill.id);
      }
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
      const impactedByWeight = props?.impactedByWeight ?? false;
      const usableWithoutTraining = props?.usableWithoutTraining ?? true;

      if (impactedByWeight) {
        this.weightAffectedSkills.add(stripSeparators(skill.name));
      }

      const innate = this.innateSkillIds.has(skill.id);
      const invested = this.rankBySkillId.get(skill.id) ?? 0;
      const rank = invested;
      const abilityName = abilityNameById.get(skill.primaryAbilityId) ?? "";
      const ability = abilityName ? this.characterAbilities.getAbilityModifier(abilityName) : 0;
      const weight = 0;
      const misc = 0;
      const size = skill.name === "Hide" ? (SIZE_HIDE_MOD[this.raceSize] ?? 0) : 0;
      const total = rank + ability + size + misc - weight;

      this.skillAbilityNames.set(stripSeparators(skill.name), abilityName);
      this.detailedCharacterSkills[stripSeparators(skill.name)] = {
        name: skill.name,
        description: skill.description ?? undefined,
        trained: usableWithoutTraining ? true : invested !== 0,
        innate,
        rank,
        ability,
        weight,
        size,
        misc,
        total,
      };
    }
  }

  /** Enriches ruleset skills with character-specific class/rank data for level-up UI. */
  getEnrichedSkills<T extends { id: string; name: string }>(
    allSkills: T[],
    classSkillIds: Set<string>,
  ): (T & { isClassSkill: boolean; isCurrentClassSkill: boolean; currentRank: number })[] {
    return allSkills.map((skill) => {
      const skillData = this.detailedCharacterSkills[stripSeparators(skill.name)];
      return {
        ...skill,
        isClassSkill: skillData?.innate ?? classSkillIds.has(skill.id),
        isCurrentClassSkill: classSkillIds.has(skill.id),
        currentRank: skillData?.rank || 0,
      };
    });
  }

  getSkillBudget() {
    return this.skillBudget;
  }

  // ── Getters ─────────────────────────────────────────────────────
  getSkills() {
    return this.detailedCharacterSkills;
  }

  getValidationIssues(characterLevel: number): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const classSkillMaxRank = characterLevel + 3;
    const crossClassMaxRank = (characterLevel + 3) / 2;

    for (const [, skill] of Object.entries(this.detailedCharacterSkills)) {
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

  setArmorSources(armors: { getArmors(): ArmorsData }, shields: { getShields(): ShieldsData }) {
    this.characterArmors = armors;
    this.characterShields = shields;
  }

  setEncumbranceSource(encumbrance: { getEncumbrance(): { checkpenalty: number } }) {
    this.characterEncumbrance = encumbrance;
  }

  // ── Setters ─────────────────────────────────────────────────────
  setSkillPointDependencies(
    rulesetAbilities: RulesetAbility[],
    skillPointAbilityId: string | null,
    klassLevelProperties: Map<string, { bab: number; skills: number }>,
  ) {
    this.skillPointRulesetAbilities = rulesetAbilities;
    this.skillPointAbilityId = skillPointAbilityId;
    this.skillPointKlassLevelProperties = klassLevelProperties;
  }

  updateAvailables() {
    this.updateSkillPointTotals();
  }

  updateSkillPointTotals() {
    const skillPointAbilityName = this.skillPointAbilityId
      ? (this.skillPointRulesetAbilities.find((a) => a.id === this.skillPointAbilityId)?.name ?? null)
      : null;

    const abilityMod = skillPointAbilityName
      ? this.characterAbilities.getAbilityModifierExcludingMisc(skillPointAbilityName)
      : 0;

    const classes = this.characterClasses.getClasses();

    // Compute spent from actual skill ranks
    const spent = Object.values(classes).reduce(
      (acc, klass) =>
        acc + klass.levels.reduce((acc, level) => acc + level.skills.reduce((acc, skill) => acc + skill.rank, 0), 0),
      0,
    );

    const allLevels = Object.values(classes).flatMap((klass) => klass.levels);
    const firstCharacterLevelId =
      allLevels.length > 0
        ? allLevels.reduce((earliest, level) =>
            level.characterLevel.createdAt < earliest.characterLevel.createdAt ? level : earliest,
          ).characterLevel.id
        : null;

    const total = Object.values(classes).reduce((acc, klass) => {
      return (
        acc +
        klass.levels.reduce((acc, level) => {
          const isFirstCharacterLevel = level.characterLevel.id === firstCharacterLevelId;
          const multiplier = isFirstCharacterLevel ? 4 : 1;
          const skillPoints = this.skillPointKlassLevelProperties.get(level.klassLevel.id)?.skills ?? 0;
          return acc + Math.max(1, (skillPoints + abilityMod + this.skillBudget.perlevel) * multiplier);
        }, 0)
      );
    }, 0);

    this.skillBudget.total = total;
    this.skillBudget.spent = spent;
    this.skillBudget.available = total - spent;
  }

  updateTotal(skillName: string) {
    const skill = this.detailedCharacterSkills[skillName];
    skill.total = skill.rank + skill.ability + skill.size + skill.misc - skill.weight;
  }

  updateTotals() {
    this.recalculateArmorCheckPenalty();
    for (const skillName of Object.keys(this.detailedCharacterSkills)) {
      this.updateTotal(skillName);
    }
  }

  // ── Update methods ──────────────────────────────────────────────
  refreshAbilityModifiers() {
    for (const [skillName, skill] of Object.entries(this.detailedCharacterSkills)) {
      const abilityName = this.skillAbilityNames.get(skillName);
      if (abilityName) {
        skill.ability = this.characterAbilities.getAbilityModifier(abilityName);
      }
    }
    this.updateTotals();
  }
}
