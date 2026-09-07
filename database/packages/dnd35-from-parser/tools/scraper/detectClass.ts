import { stripSeparators } from "@/shared/utils.ts";
import type { RequirementEntry, ModifierSeed } from "@/database/packages/dnd35/v1/feats/types.ts";
import { feat, eq, gte, or, eqStr } from "@/database/packages/dnd35/seed-utils/helpers.ts";
import type { BabType, SaveType, ClassReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";
import { SIMPLE_WEAPONS, MARTIAL_WEAPONS, EXOTIC_WEAPONS } from "@/database/packages/dnd35/v1/feats/weapons.ts";
import { findCreatureType } from "@/database/packages/dnd35/v1/feats/creatureTypes.ts";
import { findInvalidRequirementPaths } from "@/database/packages/dnd35-from-parser/tools/scraper/paths.ts";
import { detectModifiers } from "@/database/packages/dnd35-from-parser/tools/scraper/detectFeat.ts";
import { BOOK_ABBREV_PATTERN, SKILL_MAP, lookupWithPluralVariants, matchesWithPluralVariants } from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import { SKILL_NAMES } from "@/database/packages/dnd35/v1/feats/skills.ts";

// ---------------------------------------------------------------------------
// BAB detection
// ---------------------------------------------------------------------------

export function detectBab(progression: ClassReference["raw"]["progression"]): BabType {
  for (const row of progression) {
    const { level, bab } = row;
    if (bab === level) continue;
    if (bab === Math.floor(level * 3 / 4)) continue;
    if (bab === Math.floor(level / 2)) continue;
  }
  // Check from last level for most reliable detection
  const last = progression[progression.length - 1];
  if (last.bab === last.level) return "good";
  if (last.bab === Math.floor(last.level * 3 / 4)) return "medium";
  return "poor";
}

// ---------------------------------------------------------------------------
// Save detection
// ---------------------------------------------------------------------------

function goodSave(level: number): number {
  return Math.floor(level / 2) + 2;
}

export function detectSave(progression: ClassReference["raw"]["progression"], key: "fortSave" | "refSave" | "willSave"): SaveType {
  const last = progression[progression.length - 1];
  const level = last.level;
  if (last[key] === goodSave(level)) return "good";
  return "poor";
}

export function detectSaves(progression: ClassReference["raw"]["progression"]): { fortitude: SaveType; reflex: SaveType; will: SaveType } {
  return {
    fortitude: detectSave(progression, "fortSave"),
    reflex: detectSave(progression, "refSave"),
    will: detectSave(progression, "willSave"),
  };
}

// ---------------------------------------------------------------------------
// HD / Skill Points parsing
// ---------------------------------------------------------------------------

export function parseHd(hitDie: string): number {
  const match = hitDie.match(/d(\d+)/);
  return match ? parseInt(match[1], 10) : 8;
}

export function parseSkillPoints(text: string): number {
  const match = text.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 2;
}

// ---------------------------------------------------------------------------
// Prerequisite parsing
// ---------------------------------------------------------------------------

/** Normalize abbreviated Craft subtypes from prerequisite text to proper D&D skill names */
function normalizeCraftSubtype(subtype: string): string {
  const lower = subtype.toLowerCase().trim();
  const map: Record<string, string> = {
    leather: "leatherworking", metal: "metalworking", wood: "woodworking",
    stone: "stoneworking", bone: "bonecarving", gem: "gemcutting",
    cloth: "weaving", pottery: "pottery", basket: "basketweaving",
  };
  return map[lower] ?? subtype;
}

function skillSlug(name: string): string {
  // Try full name first (preserves subtypes like "Knowledge (arcana)" → "knowledgearcana")
  const fullKey = name.toLowerCase().trim();
  if (SKILL_MAP[fullKey]) return SKILL_MAP[fullKey];
  // Fall back to base name without subspecialty (e.g. "Perform (dance)" → "perform")
  const baseName = name.replace(/\s*\([^)]*\)\s*$/, "").toLowerCase().trim();
  return SKILL_MAP[baseName] ?? stripSeparators(baseName);
}

/** Expand "Knowledge (any)" to OR of all matching knowledge skills, or handle multi-option parentheticals */
function expandSkillRequirement(name: string, ranks: number): RequirementEntry | null {
  // "Knowledge (any)" → OR of all Knowledge skills
  if (/\(any\)/i.test(name)) {
    const baseName = name.replace(/\s*\(any\)/i, "").trim().toLowerCase();
    const matchingSlugs = SKILL_NAMES
      .filter(s => s.toLowerCase().startsWith(baseName))
      .map(s => stripSeparators(s));
    if (matchingSlugs.length === 1) {
      return gte(`skills.${matchingSlugs[0]}.rank`, ranks);
    }
    if (matchingSlugs.length > 1) {
      return or(...matchingSlugs.map(s => gte(`skills.${s}.rank`, ranks)));
    }
  }

  // "Knowledge (arcana, local or psionics)" or "Craft (leather, metal, or woodworking)" → OR of individual skills
  const multiMatch = name.match(/^(.+?)\s*\(([^)]*(?:,|or)[^)]*)\)$/i);
  if (multiMatch) {
    const baseName = multiMatch[1].trim();
    const options = multiMatch[2].split(/,\s*(?:or\s+)?|\s+or\s+/).map(o => o.trim()).filter(Boolean);
    if (options.length >= 2) {
      const slugs = options.map(opt => {
        // Normalize abbreviated Craft subtypes: "leather" → "leatherworking", "metal" → "metalworking"
        const normalized = /^craft$/i.test(baseName) ? normalizeCraftSubtype(opt) : opt;
        const fullName = `${baseName} (${normalized.charAt(0).toUpperCase() + normalized.slice(1)})`;
        // Try exact SKILL_MAP lookup first, fall back to constructing the slug directly
        return SKILL_MAP[fullName.toLowerCase()] ?? stripSeparators(fullName);
      });
      return or(...slugs.map(s => gte(`skills.${s}.rank`, ranks)));
    }
  }

  return null;
}

export function parseRequirements(parsed: ClassReference["raw"]["prerequisites"]["parsed"]): { requirements: RequirementEntry[]; featNameMap: Record<string, string>; errors: string[]; unresolvedPrereqs: string[] } {
  const reqs: RequirementEntry[] = [];
  const featNameMap: Record<string, string> = {};
  const errors: string[] = [];
  const unresolvedPrereqs: string[] = [];

  if (parsed.bab) {
    reqs.push(gte("combat.bab", parsed.bab));
  }

  // Skills that exist in D&D 3.5 but aren't tracked in this system
  const NON_TRACKABLE_SKILLS = new Set(["speak language"]);

  if (parsed.skills) {
    let lastSkillReqIdx = -1;
    for (let i = 0; i < parsed.skills.length; i++) {
      const s = parsed.skills[i];

      // Skip skills not tracked in this system (e.g. "Speak Language")
      const baseName = s.name.replace(/\s*\([^)]*\)\s*$/, "").toLowerCase().trim();
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
        const parts = s.name.split(/\s+or\s+/i).map((p) => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          reqs.push(or(...parts.map((p) => gte(`skills.${skillSlug(p)}.rank`, s.ranks))));
          lastSkillReqIdx = reqs.length - 1;
          continue;
        }
      }
      // "or Intimidate" as a separate entry → merge with previous skill req as OR
      if (/^or\s+/i.test(s.name)) {
        const name = s.name.replace(/^or\s+/i, "");
        const newTarget = `skills.${skillSlug(name)}.rank`;
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
      reqs.push(gte(`skills.${skillSlug(s.name)}.rank`, s.ranks));
      lastSkillReqIdx = reqs.length - 1;
    }
  }

  if (parsed.feats) {
    for (const f of parsed.feats) {
      // Skip scraping artifacts (page references, HTML fragments, etc.)
      if (/\bpage \d+\b|^[^a-zA-Z]*$/i.test(f)) continue;

      // "any metamagic feat" / "any item creation feat" → grouping wildcard
      if (/any (?:other )?metamagic feat/i.test(f) && !/item creation/i.test(f)) {
        reqs.push(eq("feats.metamagic.*.possessed"));
        continue;
      }
      if (/any (?:other )?item creation feat/i.test(f) && !/metamagic/i.test(f)) {
        reqs.push(eq("feats.itemcreation.*.possessed"));
        continue;
      }
      // "Any [N] metamagic or item creation feats" → OR of both wildcards
      if (/any\b.*\bmetamagic\b.*\bitem creation\b.*\bfeats?\b/i.test(f)) {
        reqs.push(or(eq("feats.metamagic.*.possessed"), eq("feats.itemcreation.*.possessed")));
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
  }

  if (parsed.casterLevel) {
    for (const cl of parsed.casterLevel) {
      if (cl.type === "any") {
        reqs.push(or(
          gte("spellcasting.arcane", cl.level),
          gte("spellcasting.divine", cl.level),
        ));
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
  if (parsed.special) {
    for (const s of parsed.special) {
      const raceReq = parseRaceRequirement(s);
      if (raceReq) { reqs.push(raceReq); continue; }

      const profReq = parseProficiencyRequirement(s, featNameMap);
      if (profReq) { reqs.push(profReq); continue; }

      const abilityReq = parseSpecialAbilityRequirement(s, featNameMap);
      if (abilityReq) { reqs.push(abilityReq); continue; }

      // Track mechanical prerequisites that we couldn't parse (sneak attack, rage, etc.)
      // Discard narrative/RP-only ones (deity worship, organization membership, rituals)
      if (isMechanicalPrereq(s)) {
        unresolvedPrereqs.push(s);
      }
    }
  }

  // Validate all requirement paths
  const validatedReqs: RequirementEntry[] = [];
  for (const req of reqs) {
    const invalid = findInvalidRequirementPaths(req);
    if (invalid.length > 0) {
      for (const p of invalid) errors.push(`Invalid requirement path: "${p}"`);
    } else {
      validatedReqs.push(req);
    }
  }

  return { requirements: validatedReqs, featNameMap, errors, unresolvedPrereqs };
}

function parseAlignmentRequirement(text: string): RequirementEntry | undefined {
  const lower = text.toLowerCase().trim().replace(/\.$/, "");
  const path = "identity.beliefs.alignment";

  if (lower.startsWith("any evil")) {
    return or(
      eqStr(path, "Lawful Evil"),
      eqStr(path, "Neutral Evil"),
      eqStr(path, "Chaotic Evil"),
    );
  }
  if (lower.startsWith("any good")) {
    return or(
      eqStr(path, "Lawful Good"),
      eqStr(path, "Neutral Good"),
      eqStr(path, "Chaotic Good"),
    );
  }
  if (lower.startsWith("any lawful")) {
    return or(
      eqStr(path, "Lawful Good"),
      eqStr(path, "Lawful Neutral"),
      eqStr(path, "Lawful Evil"),
    );
  }
  if (lower.startsWith("any chaotic")) {
    return or(
      eqStr(path, "Chaotic Good"),
      eqStr(path, "Chaotic Neutral"),
      eqStr(path, "Chaotic Evil"),
    );
  }
  if (lower.startsWith("any non-evil") || lower.startsWith("any nonevil")) {
    return or(
      eqStr(path, "Lawful Good"),
      eqStr(path, "Neutral Good"),
      eqStr(path, "Chaotic Good"),
      eqStr(path, "Lawful Neutral"),
      eqStr(path, "True Neutral"),
      eqStr(path, "Chaotic Neutral"),
    );
  }
  if (lower.startsWith("any non-good") || lower.startsWith("any nongood")) {
    return or(
      eqStr(path, "Lawful Neutral"),
      eqStr(path, "True Neutral"),
      eqStr(path, "Chaotic Neutral"),
      eqStr(path, "Lawful Evil"),
      eqStr(path, "Neutral Evil"),
      eqStr(path, "Chaotic Evil"),
    );
  }
  if (lower.startsWith("any non-lawful") || lower.startsWith("any nonlawful")) {
    return or(
      eqStr(path, "Neutral Good"),
      eqStr(path, "True Neutral"),
      eqStr(path, "Neutral Evil"),
      eqStr(path, "Chaotic Good"),
      eqStr(path, "Chaotic Neutral"),
      eqStr(path, "Chaotic Evil"),
    );
  }
  if (lower.startsWith("any non-chaotic") || lower.startsWith("any nonchaotic")) {
    return or(
      eqStr(path, "Lawful Good"),
      eqStr(path, "Lawful Neutral"),
      eqStr(path, "Lawful Evil"),
      eqStr(path, "Neutral Good"),
      eqStr(path, "True Neutral"),
      eqStr(path, "Neutral Evil"),
    );
  }

  const alignmentNames = [
    "lawful good", "neutral good", "chaotic good",
    "lawful neutral", "true neutral", "chaotic neutral",
    "lawful evil", "neutral evil", "chaotic evil",
  ];

  // Comma-separated list of alignments (e.g. "Neutral good, lawful neutral, neutral, chaotic neutral, or neutral evil.")
  if (lower.includes(",")) {
    const parts = lower.replace(/\.$/, "").split(/,\s*/).map(s => s.replace(/^or\s+/, "").trim()).filter(Boolean);
    const matched: RequirementEntry[] = [];
    for (const part of parts) {
      const normalized = part === "neutral" ? "true neutral" : part;
      const titleCase = normalized.split(" ").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
      if (alignmentNames.includes(normalized)) {
        matched.push(eqStr(path, titleCase));
      }
    }
    if (matched.length > 0) return or(...matched);
  }

  // Specific alignment
  for (const name of alignmentNames) {
    if (lower === name || (name === "true neutral" && lower === "neutral")) {
      const titleCase = name.split(" ").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
      return eqStr(path, titleCase);
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// "Any" feat requirements — e.g. "Exotic Weapon Proficiency (any exotic weapon)"
// ---------------------------------------------------------------------------

function expandAnyFeatRequirement(text: string): RequirementEntry | undefined {
  // Pattern 0: "Any X feat" → feats.X.possessed (prefix expansion matches all variants)
  const anyFeatMatch = text.match(/^[Aa]ny\s+(\w+)\s+feat$/i);
  if (anyFeatMatch) {
    const family = stripSeparators(anyFeatMatch[1].trim());
    return { target: `feats.${family}.possessed`, operator: "equal", value: "true", valueType: "boolean" };
  }
  // Pattern 1: "FeatFamily (any category)" → extract base feat from parenthetical
  const parenMatch = text.match(/^(.+?)\s*\((.+)\)$/i);
  if (parenMatch) {
    const prefix = stripSeparators(parenMatch[1].trim());
    return { target: `feats.${prefix}.*.possessed`, operator: "equal", value: "true", valueType: "boolean" };
  }
  // Pattern 2: prose like "Spell Focus in two schools of magic" → extract leading feat family
  const proseMatch = text.match(/^(.+?)\s+(?:in\s+)?\b(?:any|two)\b/i);
  if (proseMatch) {
    const prefix = stripSeparators(proseMatch[1].trim());
    return { target: `feats.${prefix}.*.possessed`, operator: "equal", value: "true", valueType: "boolean" };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Compound feat requirements — e.g. "Weapon Focus (longbow or shortbow)"
// ---------------------------------------------------------------------------

function parseCompoundFeatRequirement(text: string, featNameMap: Record<string, string>): RequirementEntry | undefined {
  // Pattern: "FeatName (optionA or optionB)"
  const match = text.match(/^(.+?)\s*\(([^)]+\s+or\s+[^)]+)\)$/i);
  if (!match) return undefined;

  const baseFeat = match[1].trim();
  const options = match[2].split(/\s+or\s+/i).map((o) => o.trim());

  if (options.length < 2) return undefined;

  const children: RequirementEntry[] = options.map((opt) => {
    const fullName = `${baseFeat}: ${opt.charAt(0).toUpperCase() + opt.slice(1)}`;
    const slug = stripSeparators(fullName);
    featNameMap[slug] = fullName;
    return eq(feat(fullName));
  });

  return or(...children);
}

// ---------------------------------------------------------------------------
// Race requirements — e.g. "Race: Elf or half-elf", "Race: Dwarf"
// ---------------------------------------------------------------------------

const RACE_NAMES: Record<string, string> = {
  "elf": "Elf", "half-elf": "Half-Elf", "halfelf": "Half-Elf",
  "dwarf": "Dwarf", "gnome": "Gnome", "halfling": "Halfling",
  "human": "Human", "half-orc": "Half-Orc", "halforc": "Half-Orc",
};

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

// ---------------------------------------------------------------------------
// Proficiency requirements — e.g. "proficient with all martial weapons"
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Special ability requirements — turn/rebuke undead, domain access, wild shape
// ---------------------------------------------------------------------------

function parseSpecialAbilityRequirement(text: string, featNameMap: Record<string, string>): RequirementEntry | undefined {
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
    return count > 0
      ? gte("feats.sneakattack.count", count)
      : eq("feats.sneakattack.possessed");
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
  const castAbilityMatch = text.match(/[Aa](?:bility|ble) to cast (?:the )?(?:(\d+)(?:st|nd|rd|th)[- ]level )?(arcane|divine)?\s*spells?/i);
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

// ---------------------------------------------------------------------------
// Spell table parsing
// ---------------------------------------------------------------------------

function parseSpellSlotString(s: string): number[] {
  return s.split(",").map((v) => {
    const cleaned = v.trim();
    if (cleaned === "—" || cleaned === "-" || cleaned === "") return -1;
    return parseInt(cleaned, 10);
  }).filter((n) => n >= 0);
}

export function detectSpellsPerDay(progression: ClassReference["raw"]["progression"]): number[][] | undefined {
  const result: number[][] = [];
  let hasAny = false;
  for (const row of progression) {
    if (!row.spellsPerDay || row.spellsPerDay.toLowerCase().includes("+1 level")) {
      // No spells at this level — push empty row to keep level-indexed alignment
      result.push([]);
      continue;
    }
    const slots = parseSpellSlotString(row.spellsPerDay);
    result.push(slots);
    if (slots.length > 0) hasAny = true;
  }
  return hasAny ? result : undefined;
}

export function detectSpellsKnown(raw: ClassReference["raw"]): number[][] | undefined {
  if (!raw.spellsKnown || raw.spellsKnown.length === 0) return undefined;
  const result: number[][] = [];
  let hasAny = false;
  for (const row of raw.spellsKnown) {
    const slots = parseSpellSlotString(row);
    // Push empty row for all-dash entries to keep level-indexed alignment with perDay
    result.push(slots);
    if (slots.length > 0) hasAny = true;
  }
  return hasAny ? result : undefined;
}

// ---------------------------------------------------------------------------
// Feature grouping
// ---------------------------------------------------------------------------

function normalizeFeatureName(name: string): string {
  return name
    // Replace replacement characters with spaces (encoding artifacts)
    .replace(/\uFFFD/g, " ")
    // Strip leading "+N " prefix (e.g. "+1 save against poison" → "Save Against Poison")
    .replace(/^\+\d+\s+/, "")
    // Strip "+Nd6" suffixes (e.g. "Sneak attack +1d6" → "Sneak Attack")
    .replace(/\s*\+\d+d\d+$/i, "")
    // Strip "+N" suffixes (e.g. "Enhance arrow +1" → "Enhance Arrow")
    .replace(/\s*\+\d+$/, "")
    // Strip "(Nd8)" etc. (e.g. "Breath weapon (2d8)")
    .replace(/\s*\(\d+d\d+\)$/i, "")
    // Strip "(+N)" suffixes (e.g. "Natural armor increase (+1)")
    .replace(/\s*\(\+\d+\)$/, "")
    // Strip "(Stat +N)" suffixes (e.g. "Ability boost (Con +2)")
    .replace(/\s*\([A-Z][a-z]+ \+\d+\)$/, "")
    // Strip "N/day" with or without parens
    .replace(/\s*\(?\d+\/day\)?$/i, "")
    // Strip "N ft." suffixes (e.g. "Shadow jump 20 ft.")
    .replace(/\s*\d+\s*ft\.?$/i, "")
    // Strip trailing ordinals (e.g. "2nd")
    .replace(/\s*\d+(st|nd|rd|th)$/i, "")
    // Strip "N/–" damage reduction values (e.g. "Damage reduction 3/–")
    .replace(/\s*\d+\/[–-]$/, "")
    .trim()
    // Title-case each word for consistent naming (but not after apostrophes)
    .replace(/(?<!['''])\b\w/g, c => c.toUpperCase());
}

export function detectFeatureOccurrences(
  progression: ClassReference["raw"]["progression"],
): { name: string; levels: number[] }[] {
  const map = new Map<string, number[]>();

  for (const row of progression) {
    for (const special of row.special) {
      if (!special) continue;
      // Skip dash/em-dash/replacement characters and lone quotes (means "no feature at this level")
      if (special.trim().length <= 1 || /^[\u2014\u2013\u2012\u2015\uFFFD'"-]+$/.test(special.trim())) continue;
      // Skip caster advancement entries — they're not class features
      if (special.toLowerCase().includes("+1 level of existing")) continue;
      // Skip bare "spells" entries — handled by spell config, not class features
      if (special.toLowerCase().trim() === "spells") continue;
      // Skip "Table:" entries — these are table references, not class features
      if (special.startsWith("Table:")) continue;
      const normalized = normalizeFeatureName(special);
      if (!map.has(normalized)) {
        map.set(normalized, []);
      }
      map.get(normalized)!.push(row.level);
    }
  }

  return Array.from(map.entries()).map(([name, levels]) => ({ name, levels }));
}

// ---------------------------------------------------------------------------
// Caster level advancement detection
// ---------------------------------------------------------------------------

export function detectCasterAdvancement(
  progression: ClassReference["raw"]["progression"],
): ClassReference["detected"]["casterLevelAdvancement"] | undefined {
  const levels: number[] = [];
  let hasArcane = false;
  let hasDivine = false;

  for (const row of progression) {
    // Check both spellsPerDay column and Special column for advancement text
    const textsToCheck = [row.spellsPerDay, ...row.special].filter(Boolean);

    for (const text of textsToCheck) {
      const lower = text!.toLowerCase();
      if (lower.includes("+1 level of existing") || lower.includes("+1 level of")) {
        levels.push(row.level);

        if (lower.includes("arcane")) hasArcane = true;
        if (lower.includes("divine")) hasDivine = true;
        break; // Only count once per level
      }
    }
  }

  if (levels.length === 0) return undefined;

  let type: "divine" | "arcane" | "any" | "dual";
  if (hasArcane && hasDivine) type = "dual"; // Both arcane+divine (e.g. Mystic Theurge)
  else if (hasArcane) type = "arcane";
  else if (hasDivine) type = "divine";
  else type = "any"; // Generic "+1 level of existing spellcasting class"

  return { type, levels };
}

// ---------------------------------------------------------------------------
// Aptitude pick detection
// ---------------------------------------------------------------------------

// Patterns indicating the character makes a selection from a pool
const CHOICE_PATTERN = /\b(choose|chooses|select|selects|picks?|chosen|drawn from|from the following|from those given|from among)\b/i;

/** Description patterns that indicate gameplay/tactical choices, not character-build picks.
 *  These filter AFTER CHOICE_PATTERN matches — if any match, the feature is skipped.
 *  Keep these narrow: a description can contain both build choices and gameplay language.
 *  Only match when the ENTIRE feature is clearly not a build pick. */
const NON_PICK_DESCRIPTION: RegExp[] = [
  // Bonus feat with alternative: "if he already has the feat, he can choose"
  /already has the feat.{0,20}choose/i,
  // "roll and choose" / "choose the result" / "choose between the two results" — random table picks
  /choose (?:the result|between the two)/i,
  /roll .{0,20}choose/i,
];

/** Features that match CHOICE_PATTERN but aren't character-build picks.
 *  Add new entries here instead of scattering regex blocks in detectAptitudePicks. */
const NON_PICK_FEATURES: RegExp[] = [
  // Scaling abilities that increase in power, not choices
  /sneak attack|rage|wild shape|summon|damage reduction|save|trap sense|uncanny dodge|flurry|bonus language/i,
  // Named feats granted as freeFeats
  /^(Skill Focus|Skill Mastery|Precise Shot|Mettle|Catch Weapon|Evasion|Improved Evasion)\b/i,
  // Combat/passive abilities whose descriptions incidentally contain choice words
  /parry|waist|bleed|wound|grapple|intimidat|reckless|combat trap|weapon bond|oath|visage|wings|trackless/i,
  // Class abilities that aren't character-build picks
  /bardic knowledge|unarmed strike|lay on hands|turn or rebuke|weaken spirit|sense element|spirit guide|steal spell|justice blade|brilliant blade|animal companion|^mount$/i,
  // Per-use abilities whose descriptions contain incidental choice words (tactical/gameplay picks)
  /bloodwalk|arcane fist|fist of energy|spin fate|seal fate|combine songs|glyph of warding|spellpool|enhanced accuracy|student of chaos|thrall|effortless change|shapechanger|reflexive change|infinite variety|favored shape/i,
  // Elemental/energy abilities that reference a prior one-time class-entry choice
  /elemental specialty|elemental perfection|energy (?:resistance|immunity)|resistance to energy/i,
];

// D&D type suffixes embedded in raw class feature names, e.g. "Tattoo (Su or Sp)"
const TYPE_SUFFIX = /\s*\((?:Ex|Su|Sp|Su or Sp)\)$/i;

function buildFeatureMap<T>(
  features: ClassReference["raw"]["classFeatures"],
  valueFn: (cf: ClassReference["raw"]["classFeatures"][number]) => T,
): Map<string, T> {
  const map = new Map<string, T>();
  for (const cf of features) {
    map.set(cf.name.toLowerCase(), valueFn(cf));
    const stripped = cf.name.replace(TYPE_SUFFIX, "").toLowerCase();
    if (stripped !== cf.name.toLowerCase()) {
      map.set(stripped, valueFn(cf));
    }
  }
  return map;
}

/**
 * Check if a feature is a scaling ability (e.g. "Dodge bonus +1", "+2", "+3")
 * by looking at raw progression entries. If the raw entries that normalize to
 * the same name have increasing numeric suffixes, it's scaling, not a pool pick.
 */
function isScalingFeature(normalizedName: string, progression: ClassReference["raw"]["progression"]): boolean {
  const rawEntries: string[] = [];
  for (const row of progression) {
    for (const special of row.special) {
      if (!special) continue;
      if (normalizeFeatureName(special) === normalizedName) {
        rawEntries.push(special);
      }
    }
  }
  if (rawEntries.length < 2) return false;

  // Check if raw entries have increasing numeric suffixes
  const numbers = rawEntries.map((e) => {
    const m = e.match(/\+(\d+)(?:d\d+)?$|\((?:\+)?(\d+)(?:d\d+)?\)$|(\d+)\/[–-]$/);
    return m ? parseInt(m[1] ?? m[2] ?? m[3], 10) : null;
  });

  if (numbers.every((n) => n !== null)) {
    // All entries have numeric suffixes — check if they increase
    for (let i = 1; i < numbers.length; i++) {
      if (numbers[i]! <= numbers[i - 1]!) return false;
    }
    return true;
  }
  return false;
}

const ORDINAL_PREFIX = /^\d+(st|nd|rd|th)\s+/i;
function stripOrdinalPrefix(name: string): string {
  return name.replace(ORDINAL_PREFIX, "");
}

/** Merges "1st Foo" / "2nd Foo" occurrences into one entry with combined levels. */
function aggregateOrdinalVariants(
  featureOccurrences: { name: string; levels: number[] }[],
): { name: string; levels: number[] }[] {
  const map = new Map<string, { name: string; levels: Set<number> }>();
  for (const occ of featureOccurrences) {
    const base = stripOrdinalPrefix(occ.name);
    const key = base.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      for (const l of occ.levels) existing.levels.add(l);
      if (existing.name !== base && /^\d/.test(existing.name)) existing.name = base;
    } else {
      map.set(key, { name: base, levels: new Set(occ.levels) });
    }
  }
  return Array.from(map.values()).map(({ name, levels }) => ({ name, levels: [...levels].sort((a, b) => a - b) }));
}

/** Open creature-type pick — selection language near "favored enemy" / "type of creature". */
function isFavoredEnemyOpenPick(featureName: string, desc: string): boolean {
  if (!/favored enemy/i.test(featureName) && !/favored enemy/i.test(desc)) return false;
  return /(?:select|choose|designate|pick)s?\s+[^.]*?(?:type of creature|favored enemy)/i.test(desc);
}

function detectAptitudePicks(
  raw: ClassReference["raw"],
  featureOccurrences: { name: string; levels: number[] }[],
): {
  aptitudePicks?: { levels: number[]; target: string }[];
  unresolvedAptitudePicks?: string[];
} {
  const classSlug = stripSeparators(raw.name);
  const picks: { levels: number[]; target: string }[] = [];
  const unresolved: string[] = [];

  // Build a map of class feature descriptions by lowercase name
  const descMap = buildFeatureMap(raw.classFeatures, (cf) => cf.description);

  const aggregated = aggregateOrdinalVariants(featureOccurrences);

  for (const occ of aggregated) {
    // Find the description for this feature (try exact, then plural/singular variants)
    const desc = lookupWithPluralVariants(descMap, occ.name);
    if (!desc) continue;

    // Detect references to existing SRD aptitudes (e.g. "from the list of fighter bonus feats")
    // Checked before CHOICE_PATTERN since the phrasing may not match generic choice words
    const existingAptitude = detectExistingAptitudeReference(desc);
    if (existingAptitude) {
      picks.push({ levels: occ.levels, target: existingAptitude });
      continue;
    }

    if (isFavoredEnemyOpenPick(occ.name, desc)) {
      picks.push({ levels: occ.levels, target: "aptitudes.favoredenemy.allowed" });
      continue;
    }

    if (!CHOICE_PATTERN.test(desc)) continue;

    // Filter out features that match CHOICE_PATTERN but aren't character-build picks.
    // This covers scaling abilities, named feat grants, passive combat features, and
    // class abilities whose descriptions incidentally contain choice words.
    if (NON_PICK_FEATURES.some((pattern) => pattern.test(occ.name))) continue;

    // Filter out descriptions where the choice word appears in a gameplay/tactical context
    if (NON_PICK_DESCRIPTION.some((pattern) => pattern.test(desc))) continue;

    // Detect scaling bonuses from raw progression (e.g. "Dodge bonus +1", "+2", "+3")
    if (isScalingFeature(occ.name, raw.progression)) continue;

    // Single-occurrence: check for "treated as having" pattern (ranger combat style)
    if (occ.levels.length < 2) {
      const treatedFeats = parseTreatedAsHavingFeats(desc);
      if (treatedFeats) {
        const featureSlug = stripSeparators(occ.name);
        picks.push({ levels: occ.levels, target: `aptitudes.${classSlug}${featureSlug}.allowed` });
      } else {
        unresolved.push(occ.name);
      }
      continue;
    }

    const featureSlug = stripSeparators(occ.name);
    if (!featureSlug) {
      unresolved.push(occ.name);
      continue;
    }
    picks.push({
      levels: occ.levels,
      target: `aptitudes.${classSlug}${featureSlug}.allowed`,
    });
  }

  return {
    ...(picks.length > 0 ? { aptitudePicks: picks } : {}),
    ...(unresolved.length > 0 ? { unresolvedAptitudePicks: unresolved } : {}),
  };
}

function detectBonusFeatLists(
  raw: ClassReference["raw"],
  featureOccurrences: { name: string; levels: number[] }[],
): { bonusFeatLists?: { aptitude: string; feats: string[]; levels?: number[] }[] } {
  const lists: { aptitude: string; feats: string[]; levels?: number[] }[] = [];

  const descMap = buildFeatureMap(raw.classFeatures, (cf) => cf);

  for (const occ of featureOccurrences) {
    const cf = lookupWithPluralVariants(descMap, occ.name);
    if (!cf) continue;

    const desc = cf.description.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();

    // Single-level features: check for "treated as having" pattern (ranger combat style)
    if (occ.levels.length === 1) {
      const treatedFeats = parseTreatedAsHavingFeats(desc);
      if (!treatedFeats) continue;
      const ordinal = occ.levels[0] === 1 ? "1st" : occ.levels[0] === 2 ? "2nd" : occ.levels[0] === 3 ? "3rd" : `${occ.levels[0]}th`;
      lists.push({ aptitude: `${raw.name} ${occ.name} (${ordinal})`, feats: treatedFeats, levels: [occ.levels[0]] });
      continue;
    }

    // Don't flag features that are pool sub-options (those have "Name: description" patterns)
    const parsed = parsePoolSubOptions(desc);
    if (parsed && parsed.options.length >= 2) continue;

    // Try per-level parsing first (e.g. "At 1st level... select X or Y. At 2nd level... select A or B")
    const perLevel = parsePerLevelBonusFeatList(desc);
    if (perLevel) {
      const baseAptitude = `${raw.name} ${occ.name}`;
      for (const entry of perLevel) {
        const ordinal = entry.level === 1 ? "1st" : entry.level === 2 ? "2nd" : entry.level === 3 ? "3rd" : `${entry.level}th`;
        lists.push({ aptitude: `${baseAptitude} (${ordinal})`, feats: entry.feats, levels: [entry.level] });
      }
      continue;
    }

    // Fall back to shared pool parsing ("from the following list: X, Y, Z")
    const feats = parseBonusFeatList(desc);
    if (!feats) continue;

    const aptitude = `${raw.name} ${occ.name}`;
    lists.push({ aptitude, feats });
  }

  return lists.length > 0 ? { bonusFeatLists: lists } : {};
}

/** Detect when a class feature references an existing SRD aptitude by name
 *  (e.g. "from the list of fighter bonus feats"). Returns the aptitude target
 *  path or null if no known aptitude is referenced. */
function detectExistingAptitudeReference(desc: string): string | null {
  if (/fighter bonus feat|feats available to fighters?\b|bonus feats allowed to a fighter/i.test(desc)) return "aptitudes.fighterbonusfeat.allowed";
  return null;
}

/** Distinguish mechanical special prerequisites (sneak attack, rage, spellcasting, etc.)
 *  from narrative/RP-only ones (deity worship, organization membership, rituals).
 *  Mechanical ones are tracked as unresolved so they show up as TODOs. */
function isMechanicalPrereq(text: string): boolean {
  return /animal companion|spell-like|psionic/i.test(text);
}

function detectCasterType(raw: ClassReference["raw"]): { casterType?: "Arcane" | "Divine" } {
  const text = raw.classFeatures.map((f) => f.description).join(" ");
  if (/casts?\b.{0,30}\barcane spells/i.test(text) || /arcane spell failure/i.test(text)) return { casterType: "Arcane" };
  if (/casts?\b.{0,30}\bdivine spells/i.test(text) || /\bdivine focus\b/i.test(text)) return { casterType: "Divine" };
  return {};
}

// ---------------------------------------------------------------------------
// Build full detected section
// ---------------------------------------------------------------------------

/** Locked-creature-type favored-enemy features — re-routed to the shared variant. */
function detectLockedFavoredEnemies(
  raw: ClassReference["raw"],
  featureOccurrences: { name: string; levels: number[] }[],
): { lockedFavoredEnemies?: ClassReference["detected"]["lockedFavoredEnemies"] } {
  const FE_TEMPLATE = /\+2\s+(?:bonus\s+on\s+)?Bluff,\s*Listen,\s*Sense Motive,\s*Spot,?\s*and\s*Survival\s+checks/i;
  const descMap = buildFeatureMap(raw.classFeatures, (cf) => cf.description);
  const results: NonNullable<ClassReference["detected"]["lockedFavoredEnemies"]> = [];

  for (const occ of featureOccurrences) {
    const desc = lookupWithPluralVariants(descMap, occ.name);
    if (!desc) continue;
    const normalized = desc.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();

    if (!FE_TEMPLATE.test(normalized)) continue;

    const nameMatch = occ.name.match(/\(([^)]+)\)/);
    let lockedType = nameMatch ? findCreatureType(nameMatch[1]) : null;
    if (!lockedType) lockedType = findCreatureType(normalized);
    if (!lockedType) continue;

    results.push({ featureName: occ.name, levels: occ.levels, creatureType: lockedType });
  }

  return results.length > 0 ? { lockedFavoredEnemies: results } : {};
}

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

// ---------------------------------------------------------------------------
// Pool sub-option extraction
// ---------------------------------------------------------------------------

/**
 * Parse a combined pool feature description into individual sub-options.
 * Matches patterns like: "Name (Ex): description text" or "Name: description text"
 *
 * The intro text (before the first sub-option) is returned separately.
 */
const STACKABLE_PATTERNS = [
  /can be selected .* second time/i,
  /can be taken multiple times/i,
  /selected more than one time/i,
  /selected more than once/i,
  /can be selected more than once/i,
  /this ability can be selected more than once/i,
  /changes .* are cumulative/i,
];

function detectStackable(description: string): boolean {
  return STACKABLE_PATTERNS.some((p) => p.test(description));
}

function parsePoolSubOptions(description: string): { intro: string; options: { name: string; description: string; stackable?: true }[] } | undefined {
  // Match "Name (Ex/Su/Sp):" or "Name:" where Name is title-cased words (may include hyphens, apostrophes)
  const pattern = /(?:^|\.\s+)([A-Z][A-Za-z'-]+(?:\s+[A-Za-z'-]+)*)\s*(?:\((?:Ex|Su|Sp)\)\s*)?:\s*/g;
  const matches: { name: string; index: number; matchLength: number }[] = [];

  let m;
  while ((m = pattern.exec(description)) !== null) {
    matches.push({ name: m[1], index: m.index, matchLength: m[0].length });
  }

  if (matches.length < 2) return undefined;

  // Extract intro (text before first match)
  const introEnd = matches[0].index;
  const intro = description.slice(0, introEnd).replace(/\.\s*$/, "").trim();

  const options: { name: string; description: string; stackable?: true }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i].matchLength;
    const end = i + 1 < matches.length ? matches[i + 1].index : description.length;
    const desc = description.slice(start, end).replace(/\.\s*$/, "").replace(/\s+/g, " ").trim();
    options.push({ name: matches[i].name, description: desc, ...(detectStackable(desc) ? { stackable: true } : {}) });
  }

  return { intro, options };
}

// ---------------------------------------------------------------------------
// Bonus feat list detection — "from the following list: Feat1, Feat2, ..."
// ---------------------------------------------------------------------------

function parseBonusFeatList(description: string): string[] | undefined {
  // Match patterns like "from the following list: X, Y, Z" or "choose one feat from the following list: X, Y, Z"
  const match = description.match(/(?:from the following list|from the following feats)[:\s]+(.+?)(?:\.\s|$)/i);
  if (!match) return undefined;

  const listText = match[1];
  // Split on commas, handling parenthetical qualifiers like "Spell Focus (enchantment, necromancy, or transmutation only)"
  const feats: string[] = [];
  let current = "";
  let parenDepth = 0;
  for (const char of listText) {
    if (char === "(") parenDepth++;
    else if (char === ")") parenDepth--;
    else if (char === "," && parenDepth === 0) {
      const cleaned = current.replace(/^\s*(?:and|or)\s+/i, "").trim();
      if (cleaned) feats.push(cleaned);
      current = "";
      continue;
    }
    current += char;
  }
  // Last item (may have trailing period or "and" prefix)
  const last = current.replace(/^\s*(?:and|or)\s+/i, "").replace(/\.\s*$/, "").trim();
  if (last) feats.push(last);

  return feats.length >= 2 ? feats : undefined;
}

/** Parse per-level bonus feat choices from description like:
 *  "At 1st level... select either X or Y. At 2nd level... select either A or B."
 *  Returns an array of { level, feats } entries, or undefined if no per-level pattern found. */
function parsePerLevelBonusFeatList(description: string): { level: number; feats: string[] }[] | undefined {
  // Match "At Xth level" followed by feat choices, capturing up to the next period
  const pattern = /At (\d+)(?:st|nd|rd|th) level[^.]*?(?:select|choose)\s+(?:either\s+)?(.+?)\./gi;
  const results: { level: number; feats: string[] }[] = [];

  let m;
  while ((m = pattern.exec(description)) !== null) {
    const level = parseInt(m[1], 10);
    // Strip trailing "as a bonus feat" and similar
    const featText = m[2].replace(/\s+as a bonus feat\s*/i, "").trim();
    // Split on " or " and ", " — handles "X or Y" and "X, Y, or Z"
    const feats = featText
      .split(/,\s*(?:or\s+)?|\s+or\s+/i)
      .map((f) => f.replace(/^\s*(?:and|or)\s+/i, "").trim())
      .filter(Boolean);
    if (feats.length >= 2) {
      results.push({ level, feats });
    }
  }

  return results.length > 0 ? results : undefined;
}

/** Parse "treated as having the X feat" patterns from a description.
 *  Returns feat names if >= 2 found (choice), undefined otherwise.
 *  The >= 2 threshold excludes single auto-grants (samurai, exotic weapon master). */
function parseTreatedAsHavingFeats(description: string): string[] | undefined {
  const pattern = /treated as having the (.+?) feat/gi;
  const feats: string[] = [];
  let m;
  while ((m = pattern.exec(description)) !== null) {
    feats.push(m[1]);
  }
  return feats.length >= 2 ? feats : undefined;
}

// ---------------------------------------------------------------------------
// Weapon and Armor Proficiency detection
// ---------------------------------------------------------------------------

const PROF = (slug: string) => ({ operator: "set" as const, target: `feats.${slug}.possessed`, value: "true", valueType: "boolean" as const });

// Build weapon name → proficiency slug lookup
const WEAPON_PROF_MAP = new Map<string, string>();
for (const w of SIMPLE_WEAPONS) WEAPON_PROF_MAP.set(w.toLowerCase(), `simpleweaponproficiency${stripSeparators(w)}`);
for (const w of MARTIAL_WEAPONS) WEAPON_PROF_MAP.set(w.toLowerCase(), `martialweaponproficiency${stripSeparators(w)}`);
for (const w of EXOTIC_WEAPONS) WEAPON_PROF_MAP.set(w.toLowerCase(), `exoticweaponproficiency${stripSeparators(w)}`);

// Aliases for description text → canonical weapon names
const WEAPON_ALIASES: Record<string, string[]> = {
  "crossbow (light or heavy)": ["Light Crossbow", "Heavy Crossbow"],
  "crossbow (hand, light, or heavy)": ["Hand Crossbow", "Light Crossbow", "Heavy Crossbow"],
  "dagger (any type)": ["Dagger", "Punching Dagger"],
  "shortbow (normal and composite)": ["Shortbow", "Composite Shortbow"],
  "hand axe": ["Handaxe"],
};

function detectSpecificWeapons(desc: string): string[] {
  const slugs: string[] = [];
  const seen = new Set<string>();
  const d = desc.toLowerCase();

  // Extract weapon list: "plus the X, Y, and Z" or "proficient with the X, Y, and Z"
  // Also handle "proficient are X, Y, and Z" (dndtools.net monk phrasing)
  // Try multiple patterns and pick the one that actually contains weapon names
  const patterns = [
    /(?:proficient are)\s+([^.]+)/,
    /(?:plus the)\s+([^.]+)/,
    /(?:proficient with(?: the)?)\s+([^.]+)/,
  ];
  let listMatch: RegExpMatchArray | null = null;
  for (const p of patterns) {
    const m = d.match(p);
    if (m) { listMatch = m; break; }
  }
  if (!listMatch) return [];

  const listText = listMatch[1];

  // First check aliases
  for (const [alias, weapons] of Object.entries(WEAPON_ALIASES)) {
    if (listText.includes(alias)) {
      for (const w of weapons) {
        const slug = WEAPON_PROF_MAP.get(w.toLowerCase());
        if (slug && !seen.has(slug)) {
          seen.add(slug);
          slugs.push(slug);
        }
      }
    }
  }

  // Then check individual weapon names (longest first to avoid partial matches)
  const weaponNames = [...WEAPON_PROF_MAP.keys()].sort((a, b) => b.length - a.length);
  for (const wName of weaponNames) {
    if (listText.includes(wName)) {
      const slug = WEAPON_PROF_MAP.get(wName)!;
      if (seen.has(slug)) continue;
      seen.add(slug);
      slugs.push(slug);
    }
  }

  return slugs;
}

export function detectWAPModifiers(desc: string): ModifierSeed[] {
  const mods: ModifierSeed[] = [];
  const d = desc.toLowerCase();

  // "gain no proficiency with any weapon or armor" → no modifiers (prestige classes)
  if (/gain no proficiency with any weapon or armor/.test(d)) return [];

  // Only use proficiency sentences for armor/shield detection (avoid spell failure text)
  const profSentences = d.split(/\.\s+/).filter(s => /proficien/.test(s)).join(". ");

  // Weapons
  if (/all simple and martial weapons/.test(profSentences)) {
    mods.push(PROF("simpleweaponproficiency"), PROF("martialweaponproficiency"));
  } else if (/all simple weapons/.test(profSentences)) {
    mods.push(PROF("simpleweaponproficiency"));
  }

  // Specific weapon proficiencies (e.g. "plus the rapier, sap, shortbow")
  const specificWeapons = detectSpecificWeapons(profSentences);
  for (const slug of specificWeapons) {
    mods.push(PROF(slug));
  }

  // Armor — "all types of armor" / "all armor" / listing all three
  if (/all types of armor|all armor|heavy, medium, and light|light, medium, and heavy/.test(profSentences)) {
    mods.push(PROF("armorproficiencylight"), PROF("armorproficiencymedium"), PROF("armorproficiencyheavy"));
  } else {
    if (/light (and medium )?armor|light, medium/i.test(profSentences)) mods.push(PROF("armorproficiencylight"));
    if (/medium (and heavy )?armor|medium armor|light and medium armor/i.test(profSentences)) mods.push(PROF("armorproficiencymedium"));
    if (/heavy armor|medium and heavy armor/i.test(profSentences)) mods.push(PROF("armorproficiencyheavy"));
  }

  // Shields
  if (/not with shields|not.*with.*shields|but not with shields/.test(profSentences)) {
    // explicitly no shield proficiency
  } else if (/shields \(including tower shields\)|all armor and shields/.test(profSentences)) {
    mods.push(PROF("shieldproficiency"), PROF("towershieldproficiency"));
  } else if (/shields \(except tower shields\)/.test(profSentences)) {
    mods.push(PROF("shieldproficiency"));
  } else if (/\bshields\b/.test(profSentences) && !/tower shields/.test(profSentences)) {
    mods.push(PROF("shieldproficiency"));
  }
  // "proficiency with tower shields" alone (prestige class additions like Purple Dragon Knight)
  if (/proficiency with tower shields/.test(profSentences) && !mods.some(m => m.target.includes("towershieldproficiency"))) {
    mods.push(PROF("towershieldproficiency"));
  }

  return mods;
}

// ---------------------------------------------------------------------------
// Build initial mapping section
// ---------------------------------------------------------------------------

export function buildInitialMapping(
  raw: ClassReference["raw"],
  detected: ClassReference["detected"],
): ClassReference["mapping"] {
  const features: ClassReference["mapping"]["features"] = {};

  // Build a set of pool feature names (from detected aptitudePicks)
  // These are features whose description contains selectable sub-options
  const poolFeatureNames = new Set<string>();
  const poolAptitudes = new Map<string, { aptitude: string; level: number; stackable?: true }>();

  if (detected.aptitudePicks) {
    const classSlug = stripSeparators(raw.name);
    // Build a map of class feature descriptions by lowercase name
    const descMap = buildFeatureMap(raw.classFeatures, (cf) => cf);

    for (const pick of detected.aptitudePicks) {
      // Extract feature slug from target: "aptitudes.roguespecialability.allowed" → "roguespecialability"
      const slugMatch = pick.target.match(/^aptitudes\.(.+)\.allowed$/);
      if (!slugMatch) continue;
      const pickSlug = slugMatch[1].replace(new RegExp(`^${classSlug}`), "");

      // Find the matching feature occurrence
      const occ = detected.featureOccurrences.find((fo) => {
        const featureSlug = stripSeparators(fo.name);
        return featureSlug === pickSlug;
      });
      if (!occ) continue;

      // Find the raw class feature description
      const cf = lookupWithPluralVariants(descMap, occ.name);
      if (!cf) continue;

      const normalizedDesc = cf.description.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();

      // Check for choice language — this is a pool feature if description mentions selection
      if (!CHOICE_PATTERN.test(normalizedDesc)) continue;

      const aptName = `${raw.name} ${occ.name}`;
      const minLevel = Math.min(...occ.levels);

      const parsed = parsePoolSubOptions(normalizedDesc);
      const hasInlineSubs = parsed && parsed.options.length >= 2;

      if (hasInlineSubs) {
        for (const opt of parsed.options) {
          poolAptitudes.set(opt.name, { aptitude: aptName, level: minLevel, ...(opt.stackable ? { stackable: true } : {}) });
        }
      }

      // Only treat as a pool feature if it has inline sub-options;
      // orphan sub-options are detected below and will add to poolFeatureNames then
      if (hasInlineSubs) {
        poolFeatureNames.add(cf.name.toLowerCase());
        poolFeatureNames.add(occ.name.toLowerCase());
      }

      // Store aptitude info for orphan sub-option detection
      // Always set this — even without inline subs, orphan detection needs it
      // (e.g. Stonelord Stone Power has sub-options as separate classFeatures)
      poolAptitudes.set(`__pool__${cf.name.toLowerCase()}`, { aptitude: aptName, level: minLevel });
    }
  }

  // Build a set of feature names that appear in the progression table
  // (used to detect "orphan" classFeature entries that are pool sub-options)
  const progressionFeatureNames = new Set<string>();
  for (const row of raw.progression) {
    for (const special of row.special) {
      if (special) progressionFeatureNames.add(normalizeFeatureName(special).toLowerCase());
    }
  }

  // Detect orphan sub-options: classFeature entries that follow a pool parent
  // and don't appear in the progression table (e.g. Stonelord's Stone Power sub-options)
  // Use poolAptitudes __pool__ entries (broader than poolFeatureNames which only has inline-sub features)
  const orphanSubOptions = new Map<string, { name: string; description: string }[]>();
  for (let i = 0; i < raw.classFeatures.length; i++) {
    const cf = raw.classFeatures[i];
    const baseName = cf.name.replace(/\s*\((Ex|Su|Sp)\)\s*$/, "").trim();
    if (!poolAptitudes.has(`__pool__${cf.name.toLowerCase()}`) && !poolAptitudes.has(`__pool__${baseName.toLowerCase()}`)) continue;

    // This is a pool parent — check if it has inline sub-options
    const normalizedDesc = cf.description.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
    const parsed = parsePoolSubOptions(normalizedDesc);
    if (parsed && parsed.options.length >= 2) continue; // Handled by inline parsing

    // No inline sub-options — collect orphan features that follow
    const orphans: { name: string; description: string }[] = [];
    for (let j = i + 1; j < raw.classFeatures.length; j++) {
      const next = raw.classFeatures[j];
      const nextBase = next.name.replace(/\s*\((Ex|Su|Sp)\)\s*$/, "").trim();
      const nextNorm = normalizeFeatureName(nextBase).toLowerCase();
      // Stop when we hit a feature that appears in the progression table
      if (progressionFeatureNames.has(nextNorm) || progressionFeatureNames.has(nextBase.toLowerCase())) break;
      // Skip "Weapon and Armor Proficiency" — it's not a sub-option
      if (nextBase.toLowerCase() === "weapon and armor proficiency") continue;
      orphans.push({ name: nextBase, description: next.description.replace(/\n+/g, " ").replace(/\s+/g, " ").trim() });
    }
    if (orphans.length >= 2) {
      orphanSubOptions.set(baseName.toLowerCase(), orphans);
      poolFeatureNames.add(cf.name.toLowerCase());
      poolFeatureNames.add(baseName.toLowerCase());
    }
  }

  // Detect table-based sub-options: "table: X" → "X: Y" features
  // e.g. "table: Loremaster Secrets" followed by "Loremaster Secrets: Instant Mastery" etc.
  const tableSkipNames = new Set<string>();
  for (let i = 0; i < raw.classFeatures.length; i++) {
    const cf = raw.classFeatures[i];
    if (!cf.name.startsWith("table: ")) continue;
    const tableName = cf.name.replace(/^table:\s*/, "");
    tableSkipNames.add(cf.name.toLowerCase()); // skip the "table: X" feature itself

    // Find matching pool parent by checking if table slug ends with pool parent slug
    let matchedParent: string | undefined;
    for (const [key] of poolAptitudes) {
      if (!key.startsWith("__pool__")) continue;
      const parentSlug = key.replace("__pool__", "");
      const tableSlug = stripSeparators(tableName);
      if (tableSlug.endsWith(parentSlug) || tableSlug.endsWith(parentSlug + "s")) {
        matchedParent = parentSlug;
        break;
      }
    }
    if (!matchedParent) continue;

    // Collect prefixed sub-option features
    const prefix = tableName + ": ";
    const orphans: { name: string; description: string }[] = [];
    for (let j = i + 1; j < raw.classFeatures.length; j++) {
      const next = raw.classFeatures[j];
      if (!next.name.startsWith(prefix)) break;
      const subName = next.name.substring(prefix.length);
      orphans.push({ name: subName, description: next.description.replace(/\n+/g, " ").replace(/\s+/g, " ").trim() });
      tableSkipNames.add(next.name.toLowerCase());
    }

    if (orphans.length >= 2) {
      orphanSubOptions.set(matchedParent, orphans);
      poolFeatureNames.add(matchedParent);
    }
  }

  for (const cf of raw.classFeatures) {
    const baseName = cf.name.replace(/\s*\((Ex|Su|Sp)\)\s*$/, "").trim();

    // Skip "Table:" entries — not class features
    if (baseName.startsWith("Table:")) continue;
    // Skip table features and their sub-options — handled via orphan sub-option detection
    if (tableSkipNames.has(cf.name.toLowerCase())) continue;

    // If this is a pool feature, skip it and add its sub-options instead
    if (poolFeatureNames.has(cf.name.toLowerCase()) || poolFeatureNames.has(baseName.toLowerCase())) {
      const normalizedDesc = cf.description.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
      const baseSlug = stripSeparators(baseName);
      const poolOcc = detected.featureOccurrences.find((fo) =>
        matchesWithPluralVariants(stripSeparators(fo.name), baseSlug),
      );
      const poolLevel = poolOcc ? Math.min(...poolOcc.levels) : 1;
      const poolStackable = poolOcc && poolOcc.levels.length > 1 ? true : undefined;

      features[baseName] = {
        seedName: `${baseName} (${raw.name})`,
        description: normalizedDesc,
        level: poolLevel,
        ...(poolStackable ? { stackable: true } : {}),
        // No aptitude pick modifier here — aptitudePicks already handles it at runtime
      };
      const parsed = parsePoolSubOptions(normalizedDesc);
      if (parsed) {
        for (const opt of parsed.options) {
          const pool = poolAptitudes.get(opt.name);
          if (!pool) continue;
          features[opt.name] = {
            description: opt.description,
            aptitude: pool.aptitude,
            selectable: true,
            ...(pool.stackable ? { stackable: true } : {}),
            level: pool.level,
          };
        }
      }

      // Fallback: orphan sub-options (separate classFeature entries)
      const orphans = orphanSubOptions.get(baseName.toLowerCase());
      if (orphans) {
        const poolInfo = poolAptitudes.get(`__pool__${baseName.toLowerCase()}`)
          ?? poolAptitudes.get(`__pool__${cf.name.toLowerCase()}`);
        if (poolInfo) {
          for (const orphan of orphans) {
            features[orphan.name] = {
              description: orphan.description,
              aptitude: poolInfo.aptitude,
              selectable: true,
              level: poolInfo.level,
            };
          }
        }
      }
      continue;
    }

    // Skip orphan features — they were already added as sub-options above
    const isOrphan = [...orphanSubOptions.values()].some((orphans) =>
      orphans.some((o) => o.name.toLowerCase() === baseName.toLowerCase())
    );
    if (isOrphan) continue;

    // Find occurrences for this feature
    const baseNameLower = baseName.toLowerCase();
    const baseWords = new Set(baseNameLower.split(/\s+/));
    const occ = detected.featureOccurrences.find(
      (fo) => fo.name.toLowerCase() === baseNameLower,
    )
    // Substring containment: occurrence contains feature name or vice versa
    // Handles ordinal prefix ("1st Favored Enemy"), frequency suffix ("Remove Disease 1/Week"),
    // variant suffix ("Bear Form (Black)"), level suffix ("Song Of Celerity (2nd)"),
    // class suffix ("Fiendslaying (Knight Of The Chalice)")
    ?? detected.featureOccurrences.find(
      (fo) => fo.name.toLowerCase().includes(baseNameLower) || baseNameLower.includes(fo.name.toLowerCase()),
    )
    // Word-subset: all words of one name appear in the other
    // Handles extra-word mismatches like "Save Against Poison" vs "Save Bonus against Poison"
    ?? detected.featureOccurrences.find((fo) => {
      const foWords = new Set(fo.name.toLowerCase().split(/\s+/));
      return [...foWords].every((w) => baseWords.has(w)) || [...baseWords].every((w) => foWords.has(w));
    });
    // Collect variant occurrences: same feature appearing at multiple levels under different names
    // Match only true variants (suffix/prefix patterns), not unrelated features containing the name
    // e.g. "Bear Form (Black)" is a variant of "Bear Form", but "Improved Evasion" is NOT a variant of "Evasion"
    const variantOccs = detected.featureOccurrences.filter((fo) => {
      if (fo === occ) return false;
      const foLower = fo.name.toLowerCase();
      // Occurrence starts with base name (handles suffixes like "(Black)", "1/Week", "(2nd)")
      if (foLower.startsWith(baseNameLower + " ") || foLower.startsWith(baseNameLower + "(")) return true;
      // Occurrence has ordinal prefix before base name (handles "1st Favored Enemy", "2nd Favored Enemy")
      if (ORDINAL_PREFIX.test(foLower) && stripOrdinalPrefix(foLower) === baseNameLower) return true;
      return false;
    });
    // Stackable if single occurrence spans multiple levels OR total occurrences > 1
    const totalOccurrences = (occ ? 1 : 0) + variantOccs.length;
    const stackable = (occ && occ.levels.length > 1) || totalOccurrences > 1 ? true : undefined;

    // Detect spell feature level from spell table (first non-empty row)
    const spellFeatureLevel = /^spells$/i.test(baseName) && detected.spellsPerDay
      ? detected.spellsPerDay.findIndex((row) => row.length > 0) + 1
      : 0;

    // Use occ's levels if found, otherwise union of all variant occurrence levels
    const allLevels = occ
      ? [...occ.levels, ...variantOccs.flatMap((vo) => vo.levels)]
      : variantOccs.flatMap((vo) => vo.levels);
    const level = allLevels.length > 0 ? Math.min(...allLevels)
      : spellFeatureLevel || 1; // Features not in progression table are available from level 1

    const normalizedDesc = cf.description.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
    const { modifiers } = detectModifiers(normalizedDesc);
    const wapMods = baseName === "Weapon and Armor Proficiency" ? detectWAPModifiers(normalizedDesc) : [];
    const allModifiers = [...wapMods, ...modifiers];

    features[baseName] = {
      seedName: `${baseName} (${raw.name})`,
      description: normalizedDesc,
      level,
      stackable,
      ...(allModifiers.length > 0 ? { modifiers: allModifiers } : {}),
    };
  }

  // Add aptitude pick modifiers to features that have matching picks
  // (e.g. Fighter's "Bonus Feats", Rogue's "Special Abilities")
  // The feat owns the modifier; aptitudePicks that duplicate these are stripped by buildSeeds.
  if (detected.aptitudePicks) {
    const classSlug = stripSeparators(raw.name);
    for (const pick of detected.aptitudePicks) {
      const slugMatch = pick.target.match(/^aptitudes\.(.+)\.allowed$/);
      if (!slugMatch) continue;
      const pickSlug = slugMatch[1];

      // Find the feature whose name matches this pick slug
      for (const [key, feat] of Object.entries(features)) {
        // Skip features that already have an aptitude pick modifier
        if (feat.modifiers?.some((m) => m.target === pick.target)) continue;

        const keySlug = stripSeparators(key);
        const featureSlug = `${classSlug}${keySlug}`;
        // Match with class prefix (per-class aptitude) OR direct (shared
        // aptitude — slug doesn't start with classSlug, e.g.
        // aptitudes.favoredenemy.allowed). The shared branch is gated on
        // the prefix check to avoid matching "combatstyle" across classes.
        const matches = matchesWithPluralVariants(featureSlug, pickSlug)
          || (!pickSlug.startsWith(classSlug) && matchesWithPluralVariants(keySlug, pickSlug));
        if (matches) {
          // If per-level bonusFeatLists exist for this pick, the feat will be split
          // into per-level variants — don't mark stackable (e.g. Monk Bonus Feat).
          // Otherwise keep the auto-detected stackable (e.g. Fighter Bonus Feats).
          const hasPerLevelLists = detected.bonusFeatLists?.some(
            (l) => l.levels && l.levels.some((lv) => pick.levels.includes(lv)),
          );
          if (hasPerLevelLists) feat.stackable = undefined;
          // Add the aptitude pick modifier
          if (!feat.modifiers) feat.modifiers = [];
          feat.modifiers.push({ target: pick.target, operator: "add" as const, value: "1", valueType: "number" as const });
          break;
        }
      }
    }
  }

  const mapping: ClassReference["mapping"] = {
    classFeatureAptitude: `${raw.name} Class Feature`,
    features,
  };

  // Auto-populate spells from detected data
  if (detected.spellsPerDay) {
    const slug = raw.name.toLowerCase().replace(/\s+/g, "") + "spells";
    mapping.spells = {
      slug,
      ...(!raw.hasCantrips ? { noCantrips: true } : {}),
      perDay: detected.spellsPerDay,
      ...(detected.spellsKnown ? { known: detected.spellsKnown } : { knowAll: true }),
    };
  }

  // Auto-populate bonusSpellAbility from raw or class feature descriptions
  if (raw.bonusSpellAbility) {
    mapping.bonusSpellAbility = raw.bonusSpellAbility;
  } else {
    for (const cf of raw.classFeatures) {
      const m = cf.description.match(/must have (?:a |an )?(Intelligence|Wisdom|Charisma) score (?:equal to )?(?:at )?least 10/i)
        ?? cf.description.match(/bonus spells for a high (Intelligence|Wisdom|Charisma)/i);
      if (m) { mapping.bonusSpellAbility = m[1]; break; }
    }
  }

  return mapping;
}

// ---------------------------------------------------------------------------
// Occurrence map: feature occurrence name → mapping key
// ---------------------------------------------------------------------------

/** Build a map from every feature occurrence name to its mapping key.
 *  Handles direct matches, variant suffixes/prefixes, and aliases. */
export function buildOccurrenceMap(
  features: ClassReference["mapping"]["features"],
  featureOccurrences: ClassReference["detected"]["featureOccurrences"],
): Record<string, string> {
  const occurrenceMap: Record<string, string> = {};

  for (const [key, feat] of Object.entries(features)) {
    const keyLower = key.toLowerCase();
    const aliasLower = new Set(feat.aliases?.map((a) => a.toLowerCase()) ?? []);

    for (const fo of featureOccurrences) {
      if (fo.name in occurrenceMap) continue;
      const foLower = fo.name.toLowerCase();
      // Direct match
      if (foLower === keyLower) {
        occurrenceMap[fo.name] = key;
        continue;
      }
      // Alias match
      if (aliasLower.has(foLower)) {
        occurrenceMap[fo.name] = key;
        continue;
      }
      // Variant: occurrence starts with key name (suffix like "(Magic)", "Any Distance")
      if (foLower.startsWith(keyLower + " ") || foLower.startsWith(keyLower + "(")) {
        occurrenceMap[fo.name] = key;
        continue;
      }
      // Variant: ordinal prefix ("1st Favored Enemy" → "Favored Enemy")
      if (ORDINAL_PREFIX.test(foLower) && stripOrdinalPrefix(foLower) === keyLower) {
        occurrenceMap[fo.name] = key;
        continue;
      }
      // Plural match ("Bonus Feat" ↔ "Bonus Feats")
      if (matchesWithPluralVariants(foLower, keyLower)) {
        occurrenceMap[fo.name] = key;
        continue;
      }
      // Key starts with occurrence name (occurrence is a truncated version of key)
      // Handles "Rage +" matching "Rage +1/Day"
      if (keyLower.startsWith(foLower)) {
        occurrenceMap[fo.name] = key;
        continue;
      }
    }
  }

  return occurrenceMap;
}
