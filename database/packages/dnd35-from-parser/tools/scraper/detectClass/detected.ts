/** A class reference's detected section. */

import {
  detectAptitudePicks,
  detectLockedFavoredEnemies,
} from "@/database/packages/dnd35-from-parser/tools/scraper/detectClass/aptitudePicks.ts";
import { detectBonusFeatLists } from "@/database/packages/dnd35-from-parser/tools/scraper/detectClass/bonusFeatLists.ts";
import { detectFeatureOccurrences } from "@/database/packages/dnd35-from-parser/tools/scraper/detectClass/features.ts";
import { parseRequirements } from "@/database/packages/dnd35-from-parser/tools/scraper/detectClass/prerequisites.ts";
import {
  detectBab,
  detectCasterAdvancement,
  detectCasterType,
  detectSaves,
  detectSpellsKnown,
  detectSpellsPerDay,
  parseHd,
  parseSkillPoints,
} from "@/database/packages/dnd35-from-parser/tools/scraper/detectClass/progression.ts";
import { type ClassReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";

/** A class reference's detected section, from what was scraped. */
export function buildDetected(raw: ClassReference["raw"]): ClassReference["detected"] {
  const levels = raw.progression.length;
  const featureOccurrences = detectFeatureOccurrences(raw.progression);
  const { requirements, featNameMap, errors, unresolvedPrereqs } = parseRequirements(raw.prerequisites.parsed);

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
    featNameMap,
    featureOccurrences,
    ...detectAptitudePicks(raw, featureOccurrences),
    ...detectBonusFeatLists(raw, featureOccurrences),
    ...detectLockedFavoredEnemies(raw, featureOccurrences),
    ...(spellsPerDay ? { spellsPerDay } : {}),
    ...(spellsKnown ? { spellsKnown } : {}),
    ...(hasOwnSpells ? { hasOwnSpells } : {}),
    ...(hasOwnSpells ? detectCasterType(raw) : {}),
    ...(errors.length > 0 ? { errors } : {}),
    ...(unresolvedPrereqs.length > 0 ? { unresolvedPrereqs } : {}),
  };
}
