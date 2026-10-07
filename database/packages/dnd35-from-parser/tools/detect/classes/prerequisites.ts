/** Parses a prestige class's prerequisites into requirements. */

import { parseAlignmentRequirement } from "@/database/packages/dnd35-from-parser/tools/detect/alignment.ts";
import {
  findWeapon,
  parseFamilyOptions,
  stripFeatChoice,
} from "@/database/packages/dnd35-from-parser/tools/detect/featOptions.ts";
import { buildFamilyFeatRequirements } from "@/database/packages/dnd35-from-parser/tools/detect/feats.ts";
import { findInvalidRequirementPaths } from "@/database/packages/dnd35-from-parser/tools/detect/paths.ts";
import {
  buildAnySkillRequirement,
  SKILL_MAP,
  toSkillSlug,
} from "@/database/packages/dnd35-from-parser/tools/detect/targets.ts";
import { BOOK_ABBREV_PATTERN } from "@/database/packages/dnd35-from-parser/tools/text/sanitize.ts";
import { type ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import { eq, eqStr, feat, gte, or } from "@/database/packages/dnd35/content/customization/requirements.ts";
import type { RequirementEntry } from "@/database/packages/dnd35/content/customization/types.ts";
import { proficiencyRequirements } from "@/database/packages/dnd35/content/items/proficiencies.ts";
import { capitalize, stripSeparators } from "@/shared/text.ts";

/** Skills that exist in D&D 3.5 but aren't tracked in this system. */
const NON_TRACKABLE_SKILLS = new Set(["speak language"]);

const RACE_NAMES: Record<string, string> = {
  elf: "Elf",
  "half-elf": "Half-Elf",
  halfelf: "Half-Elf",
  dwarf: "Dwarf",
  gnome: "Gnome",
  halfling: "Halfling",
  human: "Human",
  "half-orc": "Half-Orc",
  halforc: "Half-Orc",
};

/** An "any" feat requirement: "Exotic Weapon Proficiency (any exotic weapon)". */
function expandAnyFeatRequirement(text: string): RequirementEntry | undefined {
  // "FeatFamily (any category)", or prose like "Spell Focus in two schools of magic" → the leading feat family
  const family = text.match(/^(.+?)\s*\(/)?.[1] ?? text.match(/^(.+?)\s+(?:in\s+)?\b(?:any|two)\b/i)?.[1];
  if (!family) return undefined;
  const slug = stripSeparators(family.trim());
  // "Spell Focus (two schools of magic)": two of the family's feats
  return /\btwo\s+\w/i.test(text) ? gte(`feats.${slug}.count`, 2) : eq(`feats.${slug}.*.possessed`);
}

/** Expand "Knowledge (any)" to OR of all matching knowledge skills, or handle multi-option parentheticals */
function expandSkillRequirement(name: string, ranks: number): RequirementEntry | null {
  // "Knowledge (any)" → OR of all Knowledge skills
  const anySkill = buildAnySkillRequirement(name, ranks);
  if (anySkill) return anySkill;

  // "Knowledge (arcana, local or psionics)" or "Craft (leather, metal, or woodworking)" → OR of individual skills
  const multiMatch = name.match(/^(.+?)\s*\(([^)]*(?:,|or)[^)]*)\)$/i);
  if (multiMatch) {
    const baseName = multiMatch[1].trim();
    const options = multiMatch[2]
      .split(/,\s*(?:or\s+)?|\s+or\s+/)
      .map((o) => o.trim())
      .filter(Boolean);
    if (options.length >= 2) {
      const slugs = options.map((opt) => {
        // Normalize abbreviated Craft subtypes: "leather" → "leatherworking", "metal" → "metalworking"
        const normalized = /^craft$/i.test(baseName) ? normalizeCraftSubtype(opt) : opt;
        const fullName = `${baseName} (${capitalize(normalized)})`;
        // Try exact SKILL_MAP lookup first, fall back to constructing the slug directly
        return SKILL_MAP[fullName.toLowerCase()] ?? stripSeparators(fullName);
      });
      return or(...slugs.map((s) => gte(`skills.${s}.rank`, ranks)));
    }
  }

  return null;
}

/**
 * A class's feat prerequisites as the scraper split them, mended: a list split inside its parentheses ("Weapon Focus
 * (longbow", "shortbow", "or composite version of either)") is one prerequisite again, and the languages read into
 * the list ("Spell Focus (conjuration) Languages: Celestial", "Infernal") are dropped.
 */
function featPrerequisites(scraped: string[]): string[] {
  const feats: string[] = [];
  for (const entry of scraped) {
    const open = feats.at(-1);
    if (open && open.split("(").length > open.split(")").length) feats[feats.length - 1] = `${open}, ${entry}`;
    else feats.push(entry);
  }
  const languages = feats.findIndex((f) => /\bLanguages?:/.test(f));
  if (languages < 0) return feats;
  return [...feats.slice(0, languages), feats[languages].replace(/\s*\bLanguages?:.*$/, "")];
}

/** The feats a class's prerequisites list, as requirements: the names their checks don't resolve to go in `featNameMap`. */
function featRequirements(
  scraped: string[],
  featNameMap: Record<string, string>,
  unresolvedPrereqs: string[],
): RequirementEntry[] {
  const reqs: RequirementEntry[] = [];
  const feats = featPrerequisites(scraped);
  for (let i = 0; i < feats.length; i++) {
    let f = feats[i];
    // Skip scraping artifacts (page references, HTML fragments, etc.)
    if (/\bpage \d+\b|^[^a-zA-Z]*$/i.test(f)) continue;

    // "Negotiator (or), Persuasive": either one
    if (/\s*\(or\)$/i.test(f) && i + 1 < feats.length) {
      reqs.push(or(eq(feat(f.replace(/\s*\(or\)$/i, ""))), eq(feat(feats[++i]))));
      continue;
    }
    // "Improved Unarmed Strike (or monk's unarmed strike ability)": the feat, which the alternative grants
    f = f.replace(/\s*\(or\b[^)]*\)$/i, "");
    // "Exotic Weapon Proficiency (kukri)": proficiency with the weapon, which may be martial
    const proficiencyWeapon = findWeapon(/^Exotic Weapon Proficiency \((.+)\)$/i.exec(f)?.[1] ?? "");
    if (proficiencyWeapon) {
      reqs.push(...proficiencyRequirements(proficiencyWeapon));
      continue;
    }
    const withoutChoice = stripFeatChoice(f);
    if (withoutChoice) {
      reqs.push(eq(feat(withoutChoice)));
      continue;
    }

    const familyReqs = buildFamilyFeatRequirements(f);
    if (familyReqs.length > 0) {
      reqs.push(...familyReqs);
      continue;
    }
    // "any" feats (e.g. "Weapon Focus (any thrown weapon)", "Spell Focus in two schools of magic",
    //   "Weapon Focus (with deity's favored weapon)")
    // → prefix wildcard on the feat family slug
    if (/\(any\b|\bany\b|\btwo\s+(schools?|weapons?|domains?|powers?|skills?|feats?)\b|\bdeity'?s?\b/i.test(f)) {
      const anyReq = expandAnyFeatRequirement(f);
      if (anyReq) {
        reqs.push(anyReq);
      } else {
        unresolvedPrereqs.push(f);
      }
      continue;
    }
    const compoundReq = parseCompoundFeatRequirement(f, featNameMap);
    if (compoundReq) {
      reqs.push(compoundReq);
    } else {
      // Strip numeric/dice suffixes (e.g. "Sudden Strike +8d6" → "Sudden Strike")
      // and book abbreviation suffixes (e.g. "Brutal Throw (CAd)" → "Brutal Throw")
      const cleaned = f.replace(/\s*\+\d+(?:d\d+)?$/, "").replace(BOOK_ABBREV_PATTERN, "");
      const slug = stripSeparators(cleaned);
      featNameMap[slug] = f;
      reqs.push(eq(feat(cleaned)));
    }
  }
  return reqs;
}

/** Distinguish mechanical special prerequisites (sneak attack, rage, spellcasting, etc.)
 *  from narrative/RP-only ones (deity worship, organization membership, rituals).
 *  Mechanical ones are tracked as unresolved so they show up as TODOs. */
function isMechanicalPrereq(text: string): boolean {
  return /animal companion|spell-like|psionic/i.test(text);
}

/** Normalize abbreviated Craft subtypes from prerequisite text to proper D&D skill names */
function normalizeCraftSubtype(subtype: string): string {
  const lower = subtype.toLowerCase().trim();
  const map: Record<string, string> = {
    leather: "leatherworking",
    metal: "metalworking",
    wood: "woodworking",
    stone: "stoneworking",
    bone: "bonecarving",
    gem: "gemcutting",
    cloth: "weaving",
    pottery: "pottery",
    basket: "basketweaving",
  };
  return map[lower] ?? subtype;
}

/** A compound feat requirement: "Weapon Focus (longbow or shortbow)". */
function parseCompoundFeatRequirement(text: string, featNameMap: Record<string, string>): RequirementEntry | undefined {
  // Pattern: "FeatName (optionA or optionB)", "FeatName (optionA, optionB, or optionC)"
  const match = text.match(/^(.+?)\s*\(([^)]+\s+or\s+[^)]+)\)$/i);
  if (!match) return undefined;

  const baseFeat = match[1].trim();
  const options = parseFamilyOptions(baseFeat, match[2]);

  if (options.length < 2) return undefined;

  const children: RequirementEntry[] = options.map((opt) => {
    const fullName = `${baseFeat}: ${capitalize(opt)}`;
    const slug = stripSeparators(fullName);
    featNameMap[slug] = fullName;
    return eq(feat(fullName));
  });

  return or(...children);
}

/** A proficiency requirement: "proficient with all martial weapons". */
function parseProficiencyRequirement(text: string, featNameMap: Record<string, string>): RequirementEntry | undefined {
  const lower = text.toLowerCase();
  if (lower.includes("proficient with all martial weapons") || lower.includes("all martial weapons")) {
    const name = "Martial Weapon Proficiency";
    const slug = stripSeparators(name);
    featNameMap[slug] = name;
    return eq(feat(name));
  }
  if (lower.includes("proficient with all simple weapons") || lower.includes("all simple weapons")) {
    const name = "Simple Weapon Proficiency";
    const slug = stripSeparators(name);
    featNameMap[slug] = name;
    return eq(feat(name));
  }
  return undefined;
}

/** A race requirement: "Race: Elf or half-elf", "Race: Dwarf". */
function parseRaceRequirement(text: string): RequirementEntry | undefined {
  const match = text.match(/^Race:\s*(.+)$/i);
  if (!match) return undefined;

  const raceText = match[1].trim().replace(/\.$/, "");

  // "Any nondragon" type entries — can't express as a concrete requirement
  if (raceText.toLowerCase().startsWith("any")) return undefined;

  const races = raceText.split(/\s+or\s+/i).map((r) => r.trim().toLowerCase());
  const resolved = races.map((r) => RACE_NAMES[r]).filter(Boolean);
  if (resolved.length === 0) return undefined;

  if (resolved.length === 1) {
    return eqStr("identity.physiology.race.name", resolved[0]);
  }

  return or(...resolved.map((r) => eqStr("identity.physiology.race.name", r)));
}

/** A special ability requirement: turning or rebuking undead, a domain's access, wild shape. */
function parseSpecialAbilityRequirement(
  text: string,
  featNameMap: Record<string, string>,
): RequirementEntry | undefined {
  const lower = text.toLowerCase();

  // "Ability to turn or rebuke undead" / "must be able to turn or rebuke undead" / "Able to turn undead"
  if (/\bturn (?:or rebuke )?undead\b/i.test(lower)) {
    const name = "Turn or Rebuke Undead";
    featNameMap[stripSeparators(name)] = name;
    return eq(`feats.${stripSeparators(name)}.*.possessed`);
  }

  // "access to the X domain"
  const domainMatch = text.match(/access to the (\w+) domain/i);
  if (domainMatch) {
    const domainName = domainMatch[1].charAt(0).toUpperCase() + domainMatch[1].slice(1).toLowerCase();
    const name = `${domainName} Domain`;
    featNameMap[stripSeparators(name)] = name;
    return eq(feat(name));
  }

  // "ability to wild shape" / "wild shape ability"
  if (/\bwild ?shape\b/i.test(lower)) {
    const name = "Wild Shape";
    featNameMap[stripSeparators(name)] = name;
    return eq(`feats.${stripSeparators(name)}.*.possessed`);
  }

  // "Sneak attack +Nd6" / "Sneak attack or sudden strike +Nd6"
  if (/\bsneak attack\b/i.test(lower)) {
    const diceMatch = text.match(/\+(\d+)d\d+/);
    const count = diceMatch ? parseInt(diceMatch[1], 10) : 0;
    if (/\bsudden strike\b/i.test(lower)) {
      return count > 0
        ? or(gte("feats.sneakattack.count", count), gte("feats.suddenstrike.count", count))
        : or(eq("feats.sneakattack.possessed"), eq("feats.suddenstrike.possessed"));
    }
    return count > 0 ? gte("feats.sneakattack.count", count) : eq("feats.sneakattack.possessed");
  }

  // "Rage or frenzy ability"
  if (/\brage\b.*\bfrenzy\b|\bfrenzy\b.*\brage\b|\brage ability\b/i.test(lower)) {
    return eq("feats.rage.possessed");
  }

  // "Flurry of blows ability"
  if (/\bflurry of blows\b/i.test(lower)) {
    return eq("feats.flurryofblows.possessed");
  }

  // "Evasion ability"
  if (/\bevasion ability\b/i.test(lower)) {
    return eq("feats.evasion.possessed");
  }

  // "Trapfinding"
  if (/\btrapfinding\b/i.test(lower)) {
    return eq("feats.trapfinding.possessed");
  }

  // "Lay on hands class feature"
  if (/\blay on hands\b/i.test(lower)) {
    return eq("feats.layonhands.possessed");
  }

  // "Inspire courage bardic music ability"
  if (/\binspire courage\b/i.test(lower)) {
    return eq("feats.inspirecourage.possessed");
  }

  // "Large size or larger"
  if (/\blarge size or larger\b/i.test(lower)) {
    const SIZE_TARGET = "identity.physiology.race.size";
    return or(
      eqStr(SIZE_TARGET, "Large"),
      eqStr(SIZE_TARGET, "Huge"),
      eqStr(SIZE_TARGET, "Gargantuan"),
      eqStr(SIZE_TARGET, "Colossal"),
    );
  }

  // Skip negated casting prereqs ("no ability to cast", "must have no ability to cast")
  if (/\bno\s+ability to cast\b/i.test(lower) || /\bmust not have\b.*\bability to cast\b/i.test(lower)) {
    return undefined;
  }

  // "Ability to cast N-level [arcane/divine] spells"
  const castAbilityMatch = text.match(
    /[Aa](?:bility|ble) to cast (?:the )?(?:(\d+)(?:st|nd|rd|th)[- ]level )?(arcane|divine)?\s*spells?/i,
  );
  if (castAbilityMatch) {
    const level = castAbilityMatch[1] ? parseInt(castAbilityMatch[1], 10) : 1;
    const type = castAbilityMatch[2]?.toLowerCase();
    if (type === "arcane") return gte("spellcasting.arcane", level);
    if (type === "divine") return gte("spellcasting.divine", level);
    return or(gte("spellcasting.arcane", level), gte("spellcasting.divine", level));
  }

  // "Ability to cast summon monster III" / "Ability to cast detect thoughts"
  if (/[Aa](?:bility|ble) to (?:cast|use)\b/i.test(lower)) {
    return or(gte("spellcasting.arcane", 1), gte("spellcasting.divine", 1));
  }

  // "Any luck feat" / "Any divine feat"
  const anyFeatMatch = text.match(/\bany (\w+) feat\b/i);
  if (anyFeatMatch) {
    const family = stripSeparators(anyFeatMatch[1]);
    return eq(`feats.${family}.possessed`);
  }

  return undefined;
}

/**
 * The skills a class's prerequisites list, as requirements: an "X or Y" one either, and an "or Y" entry folded into
 * the skill before it. A skill the system doesn't track is left out.
 */
function skillRequirements(skills: { name: string; ranks: number }[]): RequirementEntry[] {
  const reqs: RequirementEntry[] = [];
  let lastSkillReqIdx = -1;
  for (let i = 0; i < skills.length; i++) {
    const s = skills[i];

    // Skip skills not tracked in this system (e.g. "Speak Language")
    const baseName = s.name
      .replace(/\s*\([^)]*\)\s*$/, "")
      .toLowerCase()
      .trim();
    if (NON_TRACKABLE_SKILLS.has(baseName)) continue;

    // Try to expand special skill patterns first (e.g. "Knowledge (any)", "Knowledge (arcana, local or psionics)")
    const expanded = expandSkillRequirement(s.name, s.ranks);
    if (expanded) {
      reqs.push(expanded);
      lastSkillReqIdx = reqs.length - 1;
      continue;
    }

    // "Diplomacy or Intimidate 1 rank" → single entry with "or" inside
    if (/\bor\b/i.test(s.name) && !/^or\s+/i.test(s.name)) {
      const parts = s.name
        .split(/\s+or\s+/i)
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length >= 2) {
        reqs.push(or(...parts.map((p) => gte(`skills.${toSkillSlug(p)}.rank`, s.ranks))));
        lastSkillReqIdx = reqs.length - 1;
        continue;
      }
    }
    // "or Intimidate" as a separate entry → merge with previous skill req as OR
    if (/^or\s+/i.test(s.name)) {
      const name = s.name.replace(/^or\s+/i, "");
      const newTarget = `skills.${toSkillSlug(name)}.rank`;
      if (lastSkillReqIdx >= 0) {
        const prev = reqs[lastSkillReqIdx];
        // Skip if it resolves to the same path (e.g. Perform subtypes)
        if (!("chainingOperator" in prev) && prev.target === newTarget) continue;
        reqs[lastSkillReqIdx] = or(prev, gte(newTarget, s.ranks));
      } else {
        reqs.push(gte(newTarget, s.ranks));
        lastSkillReqIdx = reqs.length - 1;
      }
      continue;
    }
    reqs.push(gte(`skills.${toSkillSlug(s.name)}.rank`, s.ranks));
    lastSkillReqIdx = reqs.length - 1;
  }
  return reqs;
}

/**
 * The race, proficiency and special ability requirements of a class's special prerequisites. One it can't read is
 * unresolved when it's mechanical (sneak attack, rage…), and dropped when it's narrative (a deity, an organization).
 */
function specialRequirements(
  special: string[],
  featNameMap: Record<string, string>,
  unresolvedPrereqs: string[],
): RequirementEntry[] {
  const reqs: RequirementEntry[] = [];
  for (const s of special) {
    const raceReq = parseRaceRequirement(s);
    if (raceReq) {
      reqs.push(raceReq);
      continue;
    }

    const profReq = parseProficiencyRequirement(s, featNameMap);
    if (profReq) {
      reqs.push(profReq);
      continue;
    }

    const abilityReq = parseSpecialAbilityRequirement(s, featNameMap);
    if (abilityReq) {
      reqs.push(abilityReq);
      continue;
    }

    // Track mechanical prerequisites that we couldn't parse (sneak attack, rage, etc.)
    // Discard narrative/RP-only ones (deity worship, organization membership, rituals)
    if (isMechanicalPrereq(s)) {
      unresolvedPrereqs.push(s);
    }
  }
  return reqs;
}

/** The requirements whose paths are all valid: an invalid one is left out, its paths in `errors`. */
function validRequirements(reqs: RequirementEntry[], errors: string[]): RequirementEntry[] {
  const validatedReqs: RequirementEntry[] = [];
  for (const req of reqs) {
    const invalid = findInvalidRequirementPaths(req);
    if (invalid.length > 0) {
      for (const p of invalid) errors.push(`Invalid requirement path: "${p}"`);
    } else {
      validatedReqs.push(req);
    }
  }
  return validatedReqs;
}

export function parseRequirements(parsed: ClassReference["raw"]["prerequisites"]["parsed"]): {
  requirements: RequirementEntry[];
  featNameMap: Record<string, string>;
  errors: string[];
  unresolvedPrereqs: string[];
} {
  const reqs: RequirementEntry[] = [];
  const featNameMap: Record<string, string> = {};
  const errors: string[] = [];
  const unresolvedPrereqs: string[] = [];

  if (parsed.bab) {
    reqs.push(gte("combat.bab", parsed.bab));
  }

  if (parsed.skills) reqs.push(...skillRequirements(parsed.skills));

  if (parsed.feats) reqs.push(...featRequirements(parsed.feats, featNameMap, unresolvedPrereqs));

  if (parsed.casterLevel) {
    for (const cl of parsed.casterLevel) {
      if (cl.type === "any") {
        reqs.push(or(gte("spellcasting.arcane", cl.level), gte("spellcasting.divine", cl.level)));
      } else {
        reqs.push(gte(`spellcasting.${cl.type}`, cl.level));
      }
    }
  }

  if (parsed.alignment) {
    const alignReqs = parseAlignmentRequirement(parsed.alignment);
    if (alignReqs) reqs.push(alignReqs);
  }

  if (parsed.saves) {
    for (const s of parsed.saves) {
      const saveKey = s.name.toLowerCase();
      reqs.push(gte(`saves.${saveKey}.base`, s.base));
    }
  }

  // Class level requirements: "fighter level 4th", "5 levels of cleric"
  if (parsed.classLevels) {
    for (const cl of parsed.classLevels) {
      const slug = stripSeparators(cl.className);
      reqs.push(gte(`classes.${slug}.level`, cl.level));
    }
  }

  // Parse race, proficiency, and special ability requirements from special entries
  if (parsed.special) reqs.push(...specialRequirements(parsed.special, featNameMap, unresolvedPrereqs));

  // Validate all requirement paths
  const validatedReqs = validRequirements(reqs, errors);
  return { requirements: validatedReqs, featNameMap, errors, unresolvedPrereqs };
}
