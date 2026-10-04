/**
 * A level-up's classes:
 *
 * - getClassSkillIds — the skills a class's skill list makes class skills, subtypes included
 * - getPlannedClassSkills — the class skills of planned levels, each level's and all together
 * - getKlassLevel — a class's level from the composed ruleset, or a 404
 * - getPlannedKlassLevels — the classes and class levels of planned levels, checked
 * - getSavedKlassLevel — a saved character level's class level and class, or a 404
 */

import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";
import { BadRequestError, NotFoundError } from "@/server/errors/index.ts";
import { isSkillSubtypeOf } from "@/server/rulesets/dnd3.5/index.ts";

/** The skills class skill records make class skills: theirs, and the ruleset's subtypes of them ("Craft (…)" of Craft). */
export function getClassSkillIds(
  records: { skillId: string; skillsInRule: { name: string } }[],
  skills: { id: string; name: string }[],
): Set<string> {
  const ids = new Set(records.map((record) => record.skillId));
  const names = new Set(records.map((record) => record.skillsInRule.name));
  for (const skill of skills) {
    if (isSkillSubtypeOf(skill.name, names)) ids.add(skill.id);
  }
  return ids;
}

/**
 * The class skills of planned levels, from their classes (`klassIds`, one per level): each level's, in the ruleset's
 * skill order (what a rank costs at that level), and every planned class's together (the rank cap).
 */
export function getPlannedClassSkills(rulesetData: CachedRulesetData, klassIds: string[]) {
  const skills = rulesetData.skills;
  const recordsOf = (klassId: string) => rulesetData.klassSkillsWithSkillsByKlass.get(klassId) ?? [];
  const perLevel = klassIds.map((klassId) => {
    const ids = getClassSkillIds(recordsOf(klassId), skills);
    return skills.filter((skill) => ids.has(skill.id)).map((skill) => skill.id);
  });
  const merged = getClassSkillIds([...new Set(klassIds)].flatMap(recordsOf), skills);
  return { perLevel, merged };
}

/** The class's level `level`, in the composed ruleset, or a 404. */
export function getKlassLevel(rulesetData: CachedRulesetData, klassId: string, level: number) {
  const klassLevel = rulesetData.klassLevelByKlassAndLevel.get(`${klassId}:${level}`);
  if (!klassLevel) throw new NotFoundError("Class level not found");
  return klassLevel;
}

/**
 * Each planned level's class and class level, from the composed ruleset: a cache hit is proof of lineage. Throws when a
 * class isn't the ruleset's (nor from `rulesetIds`, when given) or a player character's, or hasn't that level.
 */
export function getPlannedKlassLevels(
  rulesetData: CachedRulesetData,
  levels: { klassId: string; level: number; abilityId: string | null }[],
  rulesetIds?: Set<string>,
) {
  return levels.map(({ klassId, level, abilityId }, i) => {
    const klass = rulesetData.klassesById.get(klassId);
    if (!klass || (rulesetIds && !rulesetIds.has(klass.rulesetId))) {
      throw new BadRequestError(`Level ${i + 1}: Class does not belong to the character's ruleset`);
    }
    if (klass.kind !== "pc") {
      throw new BadRequestError(`Level ${i + 1}: Class is not valid for a player character`);
    }
    const klassLevel = rulesetData.klassLevelByKlassAndLevel.get(`${klassId}:${level}`);
    if (!klassLevel) {
      throw new NotFoundError(`Level ${i + 1}: Class level not found`);
    }
    return { klass, klassLevel, abilityId };
  });
}

/** A saved character level's class level and class, in the composed ruleset, or a 404. */
export function getSavedKlassLevel(rulesetData: CachedRulesetData, characterLevel: { klassLevelId: string }) {
  const klassLevel = rulesetData.klassLevelsById.get(characterLevel.klassLevelId);
  if (!klassLevel) {
    throw new NotFoundError("Class level not found");
  }
  const klass = rulesetData.klassesById.get(klassLevel.klassId);
  if (!klass) {
    throw new NotFoundError("Class not found");
  }
  return { klassLevel, klass };
}
