/**
 * A level-up's classes:
 *
 * - classSkillIds — the skills a class's skill list makes class skills, subtypes included
 * - plannedClassSkills — the class skills of planned levels, each level's and all together
 * - getKlassLevel — a class's level from the composed ruleset, or a 404
 */

import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { isSkillSubtypeOf } from "@/server/rulesets/dnd3.5/DetailedCharacterSkills.ts";

/** The skills class skill records make class skills: theirs, and the ruleset's subtypes of them ("Craft (…)" of Craft). */
export function classSkillIds(
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
export function plannedClassSkills(rulesetData: CachedRulesetData, klassIds: string[]) {
  const skills = rulesetData.skills;
  const recordsOf = (klassId: string) => rulesetData.klassSkillsWithSkillsByKlass.get(klassId) ?? [];
  const perLevel = klassIds.map((klassId) => {
    const ids = classSkillIds(recordsOf(klassId), skills);
    return skills.filter((skill) => ids.has(skill.id)).map((skill) => skill.id);
  });
  const merged = classSkillIds([...new Set(klassIds)].flatMap(recordsOf), skills);
  return { perLevel, merged };
}

/** The class's level `level`, in the composed ruleset, or a 404. */
export function getKlassLevel(rulesetData: CachedRulesetData, klassId: string, level: number) {
  const klassLevel = rulesetData.klassLevelByKlassAndLevel.get(`${klassId}:${level}`);
  if (!klassLevel) throw new NotFoundError("Class level not found");
  return klassLevel;
}
