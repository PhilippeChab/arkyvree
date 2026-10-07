/**
 * Class HTML Parser — dndtools.net structure
 *
 * HTML layout:
 *   <h2>Site Tagline</h2>                    ← skip
 *   <h2>Class Name</h2>                      ← second h2
 *   <h3>Hit die</h3> <p>d10</p>
 *   <h3>Starting gold</h3> <p>...</p>
 *   <h3>Skill points</h3> <p>4 + Int</p>
 *   <h3>Class Skills</h3>
 *   <table> (skill rows with links)
 *   <h3>Requirements</h3> (prestige classes)
 *   <h3>Class Features</h3>
 *   <h4>Feature Name (Ex)</h4> <p>description</p>
 *   <h3>Advancement</h3>
 *   <table> (Level/BAB/Fort/Ref/Will/Special)
 *   <h3>Spells for ClassName</h3>
 */

import * as cheerio from "cheerio";

import { type ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";

import { parseClassFeatures } from "./features.ts";
import { parsePrerequisites } from "./prerequisites.ts";
import { detectBonusSpellAbility, parseProgression, parseSpellsKnownTable } from "./progression.ts";
import { parseClassSkills } from "./skills.ts";
import { parseAlignment, parseClassName, parseDescription, parseHitDie, parseSkillPoints } from "./summary.ts";

export function parseClassHtml(
  html: string,
  sourceUrl: string,
  book: string,
): ClassReference["raw"] & { _meta: ClassReference["_meta"] } {
  const $ = cheerio.load(html);

  const name = parseClassName($);
  const description = parseDescription($);
  const hitDie = parseHitDie($);
  const skillPointsPerLevel = parseSkillPoints($);
  const classSkills = parseClassSkills($);
  const prerequisites = parsePrerequisites($);
  const alignment = parseAlignment($);
  const { progression, hasCantrips } = parseProgression($);
  const classFeatures = parseClassFeatures($, progression);
  const spellsKnown = parseSpellsKnownTable($);
  const bonusSpellAbility = detectBonusSpellAbility($);

  if (alignment && !prerequisites.parsed.alignment) prerequisites.parsed.alignment = alignment;

  return {
    _meta: {
      type: "class",
      sourceUrl,
      book,
      scrapedAt: new Date().toISOString(),
    },
    name,
    description,
    hitDie,
    skillPointsPerLevel,
    classSkills,
    prerequisites,
    progression,
    classFeatures,
    ...(spellsKnown.length > 0 ? { spellsKnown } : {}),
    ...(hasCantrips ? { hasCantrips } : {}),
    ...(bonusSpellAbility ? { bonusSpellAbility } : {}),
  };
}
