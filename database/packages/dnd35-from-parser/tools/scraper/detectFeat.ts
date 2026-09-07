import { stripSeparators } from "@/shared/utils.ts";
import type { RequirementEntry, ModifierSeed } from "@/database/packages/dnd35/v1/feats/types.ts";
import { feat, eq, gte, or, and, eqStr } from "@/database/packages/dnd35/seed-utils/helpers.ts";
import type { FeatReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";
import { isValidModifierPath, findInvalidRequirementPaths } from "@/database/packages/dnd35-from-parser/tools/scraper/paths.ts";
import { loadBonusFeatAptitudes, loadBonusFeatClassLevels } from "@/database/packages/dnd35-from-parser/tools/buildSeeds.ts";
import { BOOK_ABBREV_PATTERN, SKILL_MAP, SAVE_MAP, validateModifiers } from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import { SKILL_NAMES } from "@/database/packages/dnd35/v1/feats/skills.ts";

// ---------------------------------------------------------------------------
// Feat type → aptitudes
// ---------------------------------------------------------------------------

const FEAT_TYPE_APTITUDES: Record<string, string[]> = {
  "general": ["General"],
  "fighter": ["General", "Fighter Bonus Feat"],
  "metamagic": ["General", "Wizard Bonus Feat"],
  "item creation": ["General", "Wizard Bonus Feat"],
};

// Patterns that extractFeatPrereqs should skip — these are class abilities, not feat names
const ABILITY_PREREQ_PATTERNS = [
  /^sneak attack ability$/i,
  /^sneak attack \+\d+d\d+$/i,
  /^sneak attack or sudden strike \+\d+d\d+$/i,
  /^rage or frenzy ability$/i,
  /^turn or rebuke undead ability$/i,
  /^smite ability$/i,
  /^flurry of blows ability$/i,
  /^favored enemy ability$/i,
  /^wild shape ability$/i,
  /^sneak attack$/i,
  /^turn or rebuke undead$/i,
  /^wild shape$/i,
  /^grace \+\d+$/i,
  /^skirmish \+\d+d\d+.*$/i,
  /^sudden strike \+\d+d\d+$/i,
  /^Weapon Proficiency\b/i,
];

// ---------------------------------------------------------------------------
// Detect requirements + aptitudes for all feats
// ---------------------------------------------------------------------------

export function buildFeatDetected(raw: FeatReference["raw"]): FeatReference["detected"] {
  const detected: FeatReference["detected"] = {};

  for (const entry of raw) {
    const { requirements: rawReqs, featNameMap, unresolvedPrereqs } = parsePrerequisiteText(entry.prerequisiteText);
    const aptitudes = [...(FEAT_TYPE_APTITUDES[entry.featType] ?? ["General"])];

    // Detect fighter bonus feat from Special text
    if (entry.special && /fighter may select/i.test(entry.special) && !aptitudes.includes("Fighter Bonus Feat")) {
      aptitudes.push("Fighter Bonus Feat");
    }

    const { modifiers, errors: modErrors, unresolvedModifiers } = detectModifiers(entry.benefit);
    const errors: string[] = [...modErrors];

    // Validate requirement paths
    const requirements: RequirementEntry[] = [];
    for (const req of rawReqs) {
      const invalid = findInvalidRequirementPaths(req);
      if (invalid.length > 0) {
        for (const p of invalid) errors.push(`Invalid requirement path: "${p}"`);
      } else {
        requirements.push(req);
      }
    }

    // Detect implicit feat prerequisites from benefit/special text
    // e.g. "to which you already have applied the Spell Focus feat"
    const implicitFeatReqs = detectImplicitFeatPrereqs(entry);
    for (const f of implicitFeatReqs) {
      if (!featNameMap[stripSeparators(f)]) {
        const slug = stripSeparators(f);
        featNameMap[slug] = f;
        requirements.push(eq(feat(f)));
      }
    }

    const template = detectTemplate(entry);

    // Auto-add FEAT_FAMILY property for metamagic and item creation feats
    const properties: { type: string; value: string }[] = [];
    if (entry.featType === "metamagic") {
      properties.push({ type: "FEAT_FAMILY", value: "Metamagic" });
    } else if (entry.featType === "item creation") {
      properties.push({ type: "FEAT_FAMILY", value: "Item Creation" });
    }

    detected[entry.name] = {
      aptitudes,
      requirements,
      modifiers,
      ...(properties.length > 0 ? { properties } : {}),
      ...(errors.length > 0 ? { errors } : {}),
      ...(!template && unresolvedModifiers.length > 0 ? { unresolvedModifiers } : {}),
      ...(!template && unresolvedPrereqs.length > 0 ? { unresolvedPrereqs } : {}),
      featNameMap,
      ...(isStackable(entry) ? { stackable: true } : {}),
      ...(template ? { template } : {}),
    };
  }

  return detected;
}

// ---------------------------------------------------------------------------
// Build mapping (merged from detected + overrides)
// ---------------------------------------------------------------------------

export function buildFeatMapping(
  raw: FeatReference["raw"],
  detected: FeatReference["detected"],
  overrides: FeatReference["mapping"]["overrides"],
  book: string,
): FeatReference["mapping"] {
  const bonusFeatAptitudes = loadBonusFeatAptitudes(book);
  const bonusFeatClassLevels = loadBonusFeatClassLevels(book);
  const mapping = { overrides } as FeatReference["mapping"];
  for (const entry of raw) {
    const det = detected[entry.name];
    const ovr = overrides[entry.name];
    if (!det) continue;

    const featNameMap = { ...det.featNameMap, ...ovr?.featNameMap };
    const baseAptitudes = ovr?.aptitudes ?? det.aptitudes;
    const extraAptitudes = (bonusFeatAptitudes.get(entry.name) ?? [])
      .filter(a => !baseAptitudes.includes(a));

    // Wrap detected requirements with class-level alternatives from bonusFeatLists
    let requirements = ovr?.requirements ?? det.requirements;
    if (!ovr?.requirements && requirements.length > 0) {
      const classLevels = bonusFeatClassLevels.get(entry.name);
      if (classLevels?.length) {
        const detectedBranch = requirements.length === 1
          ? requirements[0]
          : and(...requirements);
        const classAlts = classLevels.map(cl =>
          gte(`classes.${cl.classSlug}.level`, cl.minLevel)
        );
        requirements = [or(detectedBranch, ...classAlts)];
      }
    }

    mapping[entry.name] = {
      description: ovr?.description ?? entry.benefit,
      aptitudes: [...baseAptitudes, ...extraAptitudes],
      requirements,
      modifiers: ovr?.modifiers ?? det.modifiers ?? [],
      ...((ovr?.properties ?? det.properties)?.length ? { properties: ovr?.properties ?? det.properties } : {}),
      ...(ovr?.stackable ?? det.stackable ? { stackable: true } : {}),
      ...(ovr?.selectable === false ? { selectable: false } : {}),
      ...(det.template ? { template: det.template } : {}),
      ...(Object.keys(featNameMap).length > 0 ? { featNameMap } : {}),
      ...(ovr?.skip ? { skip: true } : {}),
    };
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// Modifier detection from benefit text
// ---------------------------------------------------------------------------

export function detectModifiers(benefit: string): { modifiers: ModifierSeed[]; errors: string[]; unresolvedModifiers: string[] } {
  const modifiers: ModifierSeed[] = [];
  const errors: string[] = [];
  const unresolvedModifiers: string[] = [];

  if (!benefit) return { modifiers, errors, unresolvedModifiers };

  /** Extract the full sentence containing the given index */
  function extractSentence(idx: number): string {
    const sentenceBoundary = /\.(?:\s+[A-Z]|\s*$)/g;
    let start = 0;
    let end = benefit.length;
    let m: RegExpExecArray | null;
    while ((m = sentenceBoundary.exec(benefit)) !== null) {
      if (m.index < idx) start = m.index + 1;
      else { end = m.index; break; }
    }
    return benefit.slice(start, end).trim();
  }

  /** Check if a match occurs in a conditional context (against X, while X, etc.) */
  function isConditional(matchIndex: number, _matchLength: number): boolean {
    const sentence = extractSentence(matchIndex).toLowerCase();
    return /\b(against|while|when|during|versus|vs\.|if you are (?!wearing)|only when|only while|only against)\b/.test(sentence);
  }

  // Pattern: "+N bonus on [all] X checks [and Y checks]"
  // Match within a single sentence (stop at period followed by space+uppercase)
  const skillBonusRegex = /\+(\d+)\s+bonus on (?:all\s+)?([^.]+checks)/gi;
  let match: RegExpExecArray | null;
  while ((match = skillBonusRegex.exec(benefit)) !== null) {
    if (isConditional(match.index, match[0].length)) continue;
    const value = match[1];
    const skillText = match[2];

    // Extract skill names: split on "checks and", "checks,", or bare "and", then strip trailing "checks"
    const parts = skillText.split(/\s+checks(?:\s+and\s+|\s*,\s*)|\s+and\s+/i);
    for (const raw of parts) {
      const name = raw.replace(/\s+checks$/i, "").trim();
      if (!name || name.toLowerCase() === "initiative") continue;
      const slug = SKILL_MAP[name.toLowerCase()];
      if (slug) {
        modifiers.push({ target: `skills.${slug}.misc`, operator: "add", value, valueType: "number" });
      } else if (name.toLowerCase() !== "all") {
        unresolvedModifiers.push(`Unresolved skill: "${extractSentence(match!.index)}"`);
      }
    }
  }

  // Pattern: "+N bonus on your X check" (singular, e.g. Run feat's "+4 bonus on your Jump check")
  const singleSkillRegex = /\+(\d+)\s+bonus on (?:your\s+)?([A-Z][a-zA-Z\s]*?)\s+check(?!s)/gi;
  while ((match = singleSkillRegex.exec(benefit)) !== null) {
    if (isConditional(match.index, match[0].length)) continue;
    const value = match[1];
    const name = match[2].trim();
    const slug = SKILL_MAP[name.toLowerCase()];
    if (slug) {
      modifiers.push({ target: `skills.${slug}.misc`, operator: "add", value, valueType: "number" });
    }
  }

  // Pattern: "+N bonus on initiative checks" or "+N to initiative"
  const initMatch = benefit.match(/\+(\d+)\s+(?:bonus (?:on|to)\s+)?initiative/i);
  if (initMatch && !isConditional(benefit.indexOf(initMatch[0]), initMatch[0].length)) {
    modifiers.push({ target: "combat.initiative.misc", operator: "add", value: initMatch[1], valueType: "number" });
  }

  // Pattern: "+N hit points" or "gain +N hit points"
  const hpMatch = benefit.match(/\+(\d+)\s+hit points/i);
  if (hpMatch && !isConditional(benefit.indexOf(hpMatch[0]), hpMatch[0].length)) {
    modifiers.push({ target: "combat.hp.misc", operator: "add", value: hpMatch[1], valueType: "number" });
  }

  // Pattern: "+N bonus on Fortitude/Reflex/Will saves/saving throws"
  const saveRegex = /\+(\d+)\s+(?:bonus (?:on|to)\s+)?(?:all\s+)?(fortitude|reflex|will)(?:\s+saving)?\s+(?:saves|throws)/gi;
  while ((match = saveRegex.exec(benefit)) !== null) {
    if (isConditional(match.index, match[0].length)) continue;
    const slug = SAVE_MAP[match[2].toLowerCase()];
    if (slug) {
      modifiers.push({ target: `saves.${slug}.misc`, operator: "add", value: match[1], valueType: "number" });
    }
  }

  // Pattern: "+N natural armor bonus" or "+N to natural armor"
  const natArmorMatch = benefit.match(/\+(\d+)\s+(?:natural armor|to natural armor)/i);
  if (natArmorMatch) {
    modifiers.push({ target: "combat.ac.natural", operator: "add", value: natArmorMatch[1], valueType: "number" });
  }

  // Pattern: "+N bonus on [all] attack rolls ... using the selected weapon"
  const weaponAttackMatch = benefit.match(/\+(\d+)\s+bonus on (?:all\s+)?attack rolls[^.]*(?:using the selected weapon|using \w+)/i);
  if (weaponAttackMatch) {
    modifiers.push({ target: "combat.tohit.misc", operator: "add", value: weaponAttackMatch[1], valueType: "number" });
  }

  // Pattern: "+N bonus on [all] damage rolls ... using the selected weapon"
  const weaponDamageMatch = benefit.match(/\+(\d+)\s+bonus on (?:all\s+)?damage rolls[^.]*(?:using the selected weapon|using \w+)/i);
  if (weaponDamageMatch) {
    modifiers.push({ target: "combat.damage.misc", operator: "add", value: weaponDamageMatch[1], valueType: "number" });
  }

  // Pattern: "threat range is doubled" (Improved Critical)
  if (/threat range is doubled/i.test(benefit)) {
    modifiers.push({ target: "combat.damage.critical.range", operator: "multiply", value: "2", valueType: "number" });
  }

  // Pattern: "+N feet" speed bonus (e.g. "speed is faster... by +10 feet")
  const speedMatch = benefit.match(/\+?(\d+)\s*(?:feet|ft\.?)\s*faster\b/i)
    ?? benefit.match(/\+(\d+)\s*(?:feet|ft\.?)\b/i);
  if (speedMatch && !isConditional(benefit.indexOf(speedMatch[0]), speedMatch[0].length)) {
    modifiers.push({ target: "combat.speed.misc", operator: "add", value: speedMatch[1], valueType: "number" });
  }

  // Pattern: "+N bonus on grapple checks"
  const grappleMatch = benefit.match(/\+(\d+)\s+bonus on (?:all\s+)?grapple checks/i);
  if (grappleMatch && !isConditional(benefit.indexOf(grappleMatch[0]), grappleMatch[0].length)) {
    modifiers.push({ target: "combat.grapple.misc", operator: "add", value: grappleMatch[1], valueType: "number" });
  }

  // Validate all paths — invalid paths are errors, not unresolved
  const { validated, errors: validationErrors } = validateModifiers(modifiers, isValidModifierPath);
  errors.push(...validationErrors);

  // If benefit describes a numeric effect but we got no valid modifiers, it's unresolved
  if (validated.length === 0 && /\+\d+\s+(?:bonus|penalty|modifier)/i.test(benefit)) {
    const bonusMatch = benefit.match(/\+\d+\s+(?:bonus|penalty|modifier)/i);
    if (bonusMatch) {
      unresolvedModifiers.push(`Unresolved bonus: "${extractSentence(bonusMatch.index!)}"`);
    }
  }

  return { modifiers: validated, errors, unresolvedModifiers };
}

// ---------------------------------------------------------------------------
// Prerequisite text → RequirementEntry[]
// ---------------------------------------------------------------------------

/** Resolve a skill name to its slug, falling back to the base skill for unknown specializations */
function featSkillSlug(name: string): string {
  const fullKey = name.toLowerCase().trim();
  if (SKILL_MAP[fullKey]) return SKILL_MAP[fullKey];
  // Strip parenthetical specialization and try base name
  const baseName = name.replace(/\s*\([^)]*\)\s*$/, "").toLowerCase().trim();
  return SKILL_MAP[baseName] ?? stripSeparators(name);
}

function parsePrerequisiteText(text: string): { requirements: RequirementEntry[]; featNameMap: Record<string, string>; unresolvedPrereqs: string[] } {
  const reqs: RequirementEntry[] = [];
  const featNameMap: Record<string, string> = {};
  const unresolvedPrereqs: string[] = [];

  if (!text || text === "-" || text === "None" || text === "none") {
    return { requirements: reqs, featNameMap, unresolvedPrereqs };
  }

  // Strip book abbreviation suffixes (e.g., "Dodge (PH)" → "Dodge") and
  // conditional parenthetical qualifiers: "(plus Str 13 for ...)" and "(or)" artifacts
  const cleanedText = text
    .replace(new RegExp(BOOK_ABBREV_PATTERN.source, "g"), "")
    .replace(/\s*\(plus [^)]+\)/gi, "")
    .replace(/\s*\(or\)/gi, "");

  // BAB (tolerates "++N" scraping artifacts)
  const babMatch = cleanedText.match(/(?:Base attack bonus|BAB)[:\s]+\+{1,2}(\d+)/i);
  if (babMatch) {
    reqs.push(gte("combat.bab", parseInt(babMatch[1], 10)));
  }

  // Base save bonus: "Base Fortitude save bonus +2"
  const saveMap: Record<string, string> = { fortitude: "fortitude", reflex: "reflex", will: "will" };
  const baseSaveRegex = /[Bb]ase\s+(Fortitude|Reflex|Will)\s+save\s+bonus\s+\+(\d+)/gi;
  let baseSaveMatch: RegExpExecArray | null;
  while ((baseSaveMatch = baseSaveRegex.exec(cleanedText)) !== null) {
    const save = saveMap[baseSaveMatch[1].toLowerCase()];
    if (save) {
      reqs.push(gte(`saves.${save}.base`, parseInt(baseSaveMatch[2], 10)));
    }
  }

  // Size requirements: "Small or Medium size", "Medium or smaller size", "Small size"
  const SIZE_TARGET = "identity.physiology.race.size";
  const SIZE_ORDER = ["Fine", "Diminutive", "Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan", "Colossal"];
  const sizeNames = SIZE_ORDER.join("|");

  // "X or Y size"
  const explicitSizeMatch = cleanedText.match(new RegExp(`\\b(${sizeNames})\\s+or\\s+(${sizeNames})\\s+size`, "i"));
  if (explicitSizeMatch) {
    const s1 = SIZE_ORDER.find(s => s.toLowerCase() === explicitSizeMatch[1].toLowerCase())!;
    const s2 = SIZE_ORDER.find(s => s.toLowerCase() === explicitSizeMatch[2].toLowerCase())!;
    reqs.push(or(eqStr(SIZE_TARGET, s1), eqStr(SIZE_TARGET, s2)));
  }

  // "X or smaller size"
  const orSmallerMatch = !explicitSizeMatch && cleanedText.match(new RegExp(`\\b(${sizeNames})\\s+or\\s+smaller\\s+size`, "i"));
  if (orSmallerMatch) {
    const maxSize = SIZE_ORDER.find(s => s.toLowerCase() === orSmallerMatch[1].toLowerCase())!;
    const maxIdx = SIZE_ORDER.indexOf(maxSize);
    const sizes = SIZE_ORDER.slice(0, maxIdx + 1);
    reqs.push(or(...sizes.map(s => eqStr(SIZE_TARGET, s))));
  }

  // "X size" (standalone)
  const exactSizeMatch = !explicitSizeMatch && !orSmallerMatch && cleanedText.match(new RegExp(`\\b(${sizeNames})\\s+size\\b`, "i"));
  if (exactSizeMatch) {
    const size = SIZE_ORDER.find(s => s.toLowerCase() === exactSizeMatch[1].toLowerCase())!;
    reqs.push(eqStr(SIZE_TARGET, size));
  }

  // Ability scores: "Str 13", "Dex 15", etc.
  const abilityMap: Record<string, string> = {
    "str": "strength", "dex": "dexterity", "con": "constitution",
    "int": "intelligence", "wis": "wisdom", "cha": "charisma",
  };
  const abilityRegex = /\b(Str|Dex|Con|Int|Wis|Cha)\s+(\d+)/gi;
  let abilityMatch: RegExpExecArray | null;
  while ((abilityMatch = abilityRegex.exec(cleanedText)) !== null) {
    const ability = abilityMap[abilityMatch[1].toLowerCase()];
    if (ability) {
      reqs.push(gte(`abilities.${ability}.total`, parseInt(abilityMatch[2], 10)));
    }
  }

  // Multi-option feat prerequisites: "Weapon Focus (heavy mace, morningstar, or greatclub)"
  // or "Weapon Focus (warhammer or light hammer)"
  // → or(eq(feat("Weapon Focus: Heavy Mace")), eq(feat("Weapon Focus: Morningstar")), ...)
  const multiOptionFeatRegex = /([A-Z][a-zA-Z ]+?)\s*\(([a-z][^)]*(?:,|or)[^)]+)\)/g;
  let multiMatch: RegExpExecArray | null;
  let textForFeatExtraction = cleanedText;

  // "Spellcasting ability (Int or Cha) 15" → or(Int >= 15, Cha >= 15)
  const spellcastingAbilityMatch = cleanedText.match(/[Ss]pellcasting ability\s*\(([^)]+)\)\s*(\d+)/);
  if (spellcastingAbilityMatch) {
    const options = spellcastingAbilityMatch[1].split(/,\s*(?:or\s+)?|\s+or\s+/).map(o => o.trim()).filter(Boolean);
    const value = parseInt(spellcastingAbilityMatch[2], 10);
    const children = options
      .map(o => abilityMap[o.toLowerCase()])
      .filter((a): a is string => !!a)
      .map(a => gte(`abilities.${a}.total`, value));
    if (children.length > 1) {
      reqs.push(or(...children));
    } else if (children.length === 1) {
      reqs.push(children[0]);
    }
    textForFeatExtraction = textForFeatExtraction.replace(spellcastingAbilityMatch[0], "");
  }
  while ((multiMatch = multiOptionFeatRegex.exec(cleanedText)) !== null) {
    const featBase = titleCaseFeat(multiMatch[1].trim());
    const optionsText = multiMatch[2];
    const options = optionsText.split(/,\s*(?:or\s+)?|\s+or\s+/).map(o => o.trim()).filter(Boolean);
    if (options.length >= 2) {
      const children = options.map(opt => {
        const name = `${featBase}: ${titleCaseFeat(opt)}`;
        const slug = stripSeparators(name);
        featNameMap[slug] = name;
        return eq(feat(name));
      });
      reqs.push(or(...children));
      // Strip this match so extractFeatPrereqs doesn't also parse partial fragments
      textForFeatExtraction = textForFeatExtraction.replace(multiMatch[0], "");
    }
  }

  // Feat prerequisites — split on commas but respect parentheses
  const featPrereqs = extractFeatPrereqs(textForFeatExtraction);
  for (const f of featPrereqs) {
    // Strip numeric/dice suffixes (e.g. "Sudden Strike +8d6" → "Sudden Strike")
    // and book abbreviation suffixes (e.g. "Brutal Throw (CAd)" → "Brutal Throw")
    const cleaned = f.replace(/\s*\+\d+(?:d\d+)?$/, "").replace(BOOK_ABBREV_PATTERN, "");
    const slug = stripSeparators(cleaned);
    featNameMap[slug] = cleaned;
    reqs.push(eq(feat(cleaned)));
  }

  // Caster level: "Caster level Nth"
  const casterMatch = cleanedText.match(/[Cc]aster level (\d+)(?:st|nd|rd|th)/);
  if (casterMatch) {
    const level = parseInt(casterMatch[1], 10);
    reqs.push(or(
      gte("spellcasting.arcane", level),
      gte("spellcasting.divine", level),
    ));
  }

  // Able to cast spells: "Ability to cast arcane spells" or specific level
  const castMatch = cleanedText.match(/[Aa](?:bility|ble) to cast (?:(\d+)(?:st|nd|rd|th)[- ]level )?(arcane|divine)?\s*spells/i);
  if (castMatch) {
    const level = castMatch[1] ? parseInt(castMatch[1], 10) : 1;
    const type = castMatch[2]?.toLowerCase();
    if (type === "arcane") {
      reqs.push(gte("spellcasting.arcane", level));
    } else if (type === "divine") {
      reqs.push(gte("spellcasting.divine", level));
    } else {
      reqs.push(or(
        gte("spellcasting.arcane", level),
        gte("spellcasting.divine", level),
      ));
    }
  }

  // Class level: "fighter level 4th", "Wizard level 1st", "Character Level 6"
  const classLevelRegex = /(\w+)\s+level\s+(\d+)(?:st|nd|rd|th)?/gi;
  let classLevelMatch: RegExpExecArray | null;
  while ((classLevelMatch = classLevelRegex.exec(cleanedText)) !== null) {
    const className = classLevelMatch[1].toLowerCase();
    const level = parseInt(classLevelMatch[2], 10);
    // Skip "caster level" (handled above)
    if (className === "caster") continue;
    // "Character level" = overall level, not a class
    if (className === "character") {
      reqs.push(gte("identity.meta.level", level));
    } else {
      const slug = stripSeparators(className);
      reqs.push(gte(`classes.${slug}.level`, level));
    }
  }

  // Skill ranks: "SkillName N ranks"
  const skillRegex = /([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*(?:\s*\([^)]+\))?)\s+(\d+)\s+ranks?/gi;
  let skillMatch: RegExpExecArray | null;
  while ((skillMatch = skillRegex.exec(cleanedText)) !== null) {
    const name = skillMatch[1].trim();
    const ranks = parseInt(skillMatch[2], 10);
    // Skip false positives
    if (name.match(/^(Base|Must|Any|Or|And|The|Can|Has|Level)$/i)) continue;

    // "Knowledge (any)" → OR of all Knowledge skills
    if (/\(any\)/i.test(name)) {
      const baseName = name.replace(/\s*\(any\)/i, "").trim().toLowerCase();
      const matchingSlugs = SKILL_NAMES
        .filter(s => s.toLowerCase().startsWith(baseName))
        .map(s => stripSeparators(s));
      if (matchingSlugs.length === 1) {
        reqs.push(gte(`skills.${matchingSlugs[0]}.rank`, ranks));
        continue;
      }
      if (matchingSlugs.length > 1) {
        reqs.push(or(...matchingSlugs.map(s => gte(`skills.${s}.rank`, ranks))));
        continue;
      }
    }

    // Try exact match first, then base skill without specialization
    const slug = featSkillSlug(name);
    reqs.push(gte(`skills.${slug}.rank`, ranks));
  }

  // Class ability prerequisites — map to actual class feature feats
  const abilityReqMap: { pattern: RegExp; resolve: (match: RegExpMatchArray) => RequirementEntry | RequirementEntry[] | null }[] = [
    {
      pattern: /[Aa]bility to (?:turn|rebuke)|[Tt]urn or rebuke undead ability|[Tt]urn or rebuke undead\b/,
      resolve: () => or(eq(feat("Turn or Rebuke Undead (Cleric)")), eq(feat("Turn Undead (Paladin)"))),
    },
    {
      // "Sneak attack or sudden strike +Nd6" — either ability with N stacks
      pattern: /[Ss]neak [Aa]ttack or [Ss]udden [Ss]trike \+(\d+)d\d+/,
      resolve: (m) => {
        const count = parseInt(m[1], 10);
        return or(gte("feats.sneakattack.count", count), gte("feats.suddenstrike.count", count));
      },
    },
    {
      // "Sneak Attack +Nd6" — require N stacks of any Sneak Attack variant
      pattern: /[Ss]neak [Aa]ttack \+(\d+)d\d+/,
      resolve: (m) => gte("feats.sneakattack.count", parseInt(m[1], 10)),
    },
    {
      pattern: /[Ss]neak [Aa]ttack ability/i,
      resolve: () => eq("feats.sneakattack.possessed"),
    },
    {
      // Bare "Sneak Attack" — just requires having it
      pattern: /[Ss]neak [Aa]ttack(?!\s*\+|\s*ability|\s*or)/,
      resolve: () => eq("feats.sneakattack.possessed"),
    },
    {
      // "Sudden Strike +Nd6" — require N stacks of any Sudden Strike variant
      pattern: /[Ss]udden [Ss]trike \+(\d+)d\d+/,
      resolve: (m) => gte("feats.suddenstrike.count", parseInt(m[1], 10)),
    },
    {
      pattern: /[Gg]race \+\d+/,
      resolve: () => eq("feats.grace.possessed"),
    },
    {
      // "Skirmish +Nd6" — require N stacks of any Skirmish variant
      pattern: /[Ss]kirmish \+(\d+)d\d+/,
      resolve: (m) => gte("feats.skirmish.count", parseInt(m[1], 10)),
    },
    {
      pattern: /[Rr]age or frenzy ability/i,
      resolve: () => eq(feat("Rage (Barbarian)")),
    },
    {
      pattern: /[Ss]mite ability/i,
      resolve: () => eq(feat("Smite Evil (Paladin)")),
    },
    {
      pattern: /[Ff]lurry of blows ability/i,
      resolve: () => eq(feat("Flurry of Blows (Monk)")),
    },
    {
      pattern: /[Ww]ild [Ss]hape ability|[Aa]bility to (?:use )?wild shape|[Ww]ild [Ss]hape\./i,
      resolve: () => eq(feat("Wild Shape (Druid)")),
    },
    {
      pattern: /[Aa]bility to acquire a (?:new )?familiar/,
      resolve: () => or(eq(feat("Familiar (Sorcerer)")), eq(feat("Familiar (Wizard)"))),
    },
    // These are class features inherent to a class — not feat prerequisites
    { pattern: /[Ff]avored enemy ability/i, resolve: () => null },
  ];

  let abilityText = cleanedText;
  for (const { pattern, resolve } of abilityReqMap) {
    const match = abilityText.match(pattern);
    if (match) {
      const result = resolve(match);
      if (result) {
        if (Array.isArray(result)) {
          reqs.push(...result);
        } else {
          reqs.push(result);
        }
      }
      abilityText = abilityText.replace(match[0], "");
    }
  }

  // Shield proficiency prerequisites
  if (/[Pp]roficien(?:t|cy) with (?:a )?(?:heavy )?shield/i.test(cleanedText)) {
    const name = "Shield Proficiency";
    const slug = stripSeparators(name);
    featNameMap[slug] = name;
    reqs.push(eq(feat(name)));
  }

  // "Any metamagic feat" / "Any item creation feat" → grouping wildcard check
  if (/any (?:other )?metamagic feat/i.test(cleanedText)) {
    reqs.push(eq("feats.metamagic.*.possessed"));
  }
  if (/any (?:other )?item creation feat/i.test(cleanedText)) {
    reqs.push(eq("feats.itemcreation.*.possessed"));
  }

  // Detect prerequisite patterns we recognize but can't map to requirement entries
  const unresolvedPatterns = [
    /[Pp]roficien(?:t|cy) with (?:selected )?(?:weapon|armor)/,
  ];
  for (const pattern of unresolvedPatterns) {
    const match = cleanedText.match(pattern);
    if (match) {
      unresolvedPrereqs.push(match[0]);
    }
  }

  return { requirements: reqs, featNameMap, unresolvedPrereqs };
}

// ---------------------------------------------------------------------------
// Extract feat names from prerequisite text
// ---------------------------------------------------------------------------

function extractFeatPrereqs(text: string): string[] {
  const feats: string[] = [];

  // Known feat patterns in prerequisite text
  // They appear as capitalized names, sometimes with additional context
  // We need to match things like "Power Attack", "Combat Expertise", "Dodge"
  // but NOT ability scores, BAB, skill ranks, or generic phrases

  // Remove ability scores, BAB, base save bonus, skill rank, and caster level clauses first
  const cleaned = text
    .replace(/(?:Base attack bonus|BAB)[:\s]+\+{1,2}\d+/gi, "")
    .replace(/[Bb]ase\s+(?:Fortitude|Reflex|Will)\s+save\s+bonus\s+\+\d+/gi, "")
    .replace(/\b(?:Str|Dex|Con|Int|Wis|Cha)\s+\d+/gi, "")
    .replace(/[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*(?:\s*\([^)]+\))?\s+\d+\s+ranks?/gi, "")
    .replace(/[Cc]aster level \d+(?:st|nd|rd|th)/g, "")
    .replace(/\w+\s+level\s+\d+(?:st|nd|rd|th)?/gi, "")
    .replace(/[Aa](?:bility|ble) to cast[^,.]+/gi, "")
    .replace(/proficiency with[^,.]+/gi, "")
    .replace(/\b(?:Fine|Diminutive|Tiny|Small|Medium|Large|Huge|Gargantuan|Colossal)\s+(?:or\s+(?:Fine|Diminutive|Tiny|Small|Medium|Large|Huge|Gargantuan|Colossal|smaller)\s+)?size\b/gi, "")
    .replace(/must be[^,.]+/gi, "")
    .trim();

  // Split remaining text on comma boundaries
  const parts = cleaned.split(/,\s*/);

  for (const part of parts) {
    let trimmed = part.trim().replace(/\.$/, "").replace(/^and\s+/i, "");
    if (!trimmed || trimmed.length < 3) continue;

    // Strip weapon/school qualifiers — refers to the template family feat
    trimmed = trimmed
      .replace(/\s*\(?with (?:selected |the )?(?:weapon|school)(?:\s+chosen)?\)?$/i, "")
      .replace(/\s+(?:in|of) the (?:chosen|selected|same) (?:school|weapon)$/i, "");

    // A feat name: starts with uppercase, at least 2 chars, not a common phrase or class ability
    if (trimmed.match(/^[A-Z][a-zA-Z]/) && !isCommonPhrase(trimmed)) {
      const titled = titleCaseFeat(trimmed);
      if (!ABILITY_PREREQ_PATTERNS.some(p => p.test(titled))) {
        feats.push(titled);
      }
    }
  }

  return feats;
}

function isCommonPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  if (/^(or|any|must|have|the|can|has|level|none|proficient|proficiency|ability|able|size|medium|large|small|tiny|at least|damage|innate)/.test(lower)) return true;
  // "X class ability" / "X class feature" — these are class features, not feats
  if (/\bclass (?:ability|feature)\b/i.test(lower)) return true;
  // "Spell-like ability at caster level X or higher" — not a feat
  if (/^spell-like ability/i.test(lower)) return true;
  return false;
}

function titleCaseFeat(s: string): string {
  // Most feat names from SRD are already in a reasonable case
  // Just ensure first letter of each word is uppercase
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Detect implicit feat prerequisites from benefit/special text
// e.g. "to which you already have applied the Spell Focus feat"
// ---------------------------------------------------------------------------

function detectImplicitFeatPrereqs(entry: FeatReference["raw"][number]): string[] {
  const feats: string[] = [];
  const text = entry.benefit + " " + (entry.special ?? "");

  // "already have applied the X feat"
  const appliedMatch = text.match(/already (?:have )?applied the\s+([A-Z][A-Za-z\s]+?)\s+feat/i);
  if (appliedMatch) {
    feats.push(titleCaseFeat(appliedMatch[1].trim()));
  }

  return feats;
}

// ---------------------------------------------------------------------------
// Template feat detection
// ---------------------------------------------------------------------------

function detectTemplate(entry: FeatReference["raw"][number]): FeatReference["detected"][string]["template"] {
  const text = (entry.benefit + " " + (entry.special ?? "")).toLowerCase();

  // Weapon templates: "selected weapon", "using the weapon you selected"
  if (/selected weapon|the weapon you selected|type of weapon/.test(text)) {
    return { type: "weapon", familyName: entry.name };
  }

  // Crossbow-specific: "chosen type of crossbow"
  if (/type of crossbow|chosen.*crossbow/.test(text)) {
    return { type: "crossbow", familyName: entry.name };
  }

  // Skill templates: "that skill", "involving that skill"
  if (/that skill|the skill you select/.test(text)) {
    return { type: "skill", familyName: entry.name };
  }

  // School templates: "school of magic you select"
  if (/school of magic/.test(text)) {
    return { type: "school", familyName: entry.name };
  }

  // "Each time you take the feat, it applies to a new type of exotic weapon"
  if (/new type of.*weapon/.test(text)) {
    return { type: "weapon", familyName: entry.name };
  }

  return undefined;
}

function isStackable(entry: FeatReference["raw"][number]): boolean {
  const special = (entry.special ?? "").toLowerCase();
  if (/do not stack|don't stack|effects are not cumulative/i.test(special)) return false;
  return /(?:can|may) (?:gain|take).*multiple times/i.test(special) ||
    /select this feat multiple times/i.test(special) ||
    special.includes("its effects stack");
}
