/** A class reference's detected section. */

import { ClassPrerequisites } from "@/database/packages/dnd35-from-parser/tools/detect/readers/requirements/ClassPrerequisites.ts";
import { type ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";

import { detectAptitudePicks, detectLockedFavoredEnemies } from "./aptitudePicks.ts";
import { detectBonusFeatLists } from "./bonusFeatLists.ts";
import { detectFeatureOccurrences } from "./features.ts";
import {
  detectBab,
  detectCasterAdvancement,
  detectCasterType,
  detectSaves,
  detectSpellsKnown,
  detectSpellsPerDay,
  parseHd,
  parseSkillPoints,
} from "./progression.ts";

/** A class reference's detected section, from what was scraped. */
export function buildDetected(raw: ClassReference["raw"]): ClassReference["detected"] {
  const levels = raw.progression.length;
  const featureOccurrences = detectFeatureOccurrences(raw.progression);
  const { requirements, errors, unresolved } = new ClassPrerequisites(raw.prerequisites.parsed);

  const spellsPerDay = detectSpellsPerDay(raw.progression);
  const spellsKnown = detectSpellsKnown(raw);
  const hasOwnSpells = spellsPerDay !== undefined;

  return {
    hd: parseHd(raw.hitDie),
    levels,
    skillPoints: parseSkillPoints(raw.skillPointsPerLevel),
    bab: detectBab(raw.progression),
    saves: detectSaves(raw.progression),
    casterLevelAdvancement: detectCasterAdvancement(raw.progression),
    requirements,
    featureOccurrences,
    ...detectAptitudePicks(raw, featureOccurrences),
    ...detectBonusFeatLists(raw, featureOccurrences),
    ...detectLockedFavoredEnemies(raw, featureOccurrences),
    ...(spellsPerDay ? { spellsPerDay } : {}),
    ...(spellsKnown ? { spellsKnown } : {}),
    ...(hasOwnSpells ? { hasOwnSpells } : {}),
    ...(hasOwnSpells ? detectCasterType(raw) : {}),
    ...(errors.length > 0 ? { errors } : {}),
    ...(unresolved.length > 0 ? { unresolvedPrereqs: unresolved } : {}),
  };
}
