import { BOOK_ABBREV_PATTERN } from "@/database/packages/dnd35-from-parser/tools/text/sanitize.ts";
import type { FeatReference } from "@/database/packages/dnd35-from-parser/tools/types/feats.ts";
import { ABILITY_ABBREVIATIONS } from "@/database/packages/dnd35-from-parser/tools/vocabulary/abilities.ts";
import { RACE_SIZE_PATH } from "@/database/packages/dnd35-from-parser/tools/vocabulary/races.ts";
import { SAVE_SLUGS } from "@/database/packages/dnd35-from-parser/tools/vocabulary/saves.ts";
import { toSkillSlug } from "@/database/packages/dnd35-from-parser/tools/vocabulary/skills.ts";
import { eq, eqStr, feat, gte, or } from "@/database/packages/dnd35/content/customization/requirements.ts";
import type { RequirementEntry } from "@/database/packages/dnd35/content/customization/types.ts";
import { SIZE_OPTIONS } from "@/shared/enums.ts";
import { stripSeparators } from "@/shared/text.ts";

import { readAlignmentRequirement } from "./alignment.ts";
import { readFamilyFeatRequirements } from "./anyFeats.ts";
import { readFamilyOptions, stripFeatChoice } from "./featOptions.ts";
import { RequirementReading } from "./RequirementReading.ts";
import { readAnySkillRequirement } from "./skills.ts";

/** The class abilities a prerequisite names, which no feat is read from: `CLASS_ABILITY_PREREQUISITES` reads them. */
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
  /^ki strike \(lawful\)$/i,
  /^relevant alignment$/i,
  /^Weapon Proficiency\b/i,
];

/** The class abilities a feat's prerequisite can name, each the requirements it is (none: a class's own feature). */
const CLASS_ABILITY_PREREQUISITES: {
  pattern: RegExp;
  resolve: (match: RegExpMatchArray) => RequirementEntry | RequirementEntry[] | null;
}[] = [
  {
    pattern: /[Aa]bility to (?:turn|rebuke)|[Tt]urn or rebuke undead ability|[Tt]urn or rebuke undead\b/,
    resolve: () => or(eq(feat("Turn or Rebuke Undead (Cleric)")), eq(feat("Turn Undead (Paladin)"))),
  },
  {
    // "Sneak attack or sudden strike +Nd6" — either ability's dice, every class's together
    pattern: /[Ss]neak [Aa]ttack or [Ss]udden [Ss]trike \+(\d+)d\d+/,
    resolve: (m) => {
      const count = parseInt(m[1], 10);
      return or(gte("feats.sneakattack.count", count), gte("feats.suddenstrike.count", count));
    },
  },
  {
    // "Sneak Attack +Nd6" — N sneak attack dice, every class's together
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
    // "Sudden Strike +Nd6" — N sudden strike dice, every class's together
    pattern: /[Ss]udden [Ss]trike \+(\d+)d\d+/,
    resolve: (m) => gte("feats.suddenstrike.count", parseInt(m[1], 10)),
  },
  {
    pattern: /[Gg]race \+\d+/,
    resolve: () => eq("feats.grace.possessed"),
  },
  {
    // "Skirmish +Nd6" — N skirmish dice, every class's together
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
    // Any class's Summon Familiar (the generator makes it a check of its family)
    pattern: /[Aa]bility to acquire a (?:new )?familiar/,
    resolve: () => eq(feat("Summon Familiar")),
  },
  {
    // A monk's ki strike is lawful from monk level 10
    pattern: /[Kk]i strike \(lawful\)/,
    resolve: () => gte("classes.monk.level", 10),
  },
  // These are class features inherent to a class — not feat prerequisites
  { pattern: /[Ff]avored enemy ability/i, resolve: () => null },
];

/** The alignment "Relevant alignment" asks of a feat for an alignment's spells ("Spell Focus (Chaos)") */
const RELEVANT_ALIGNMENTS: Record<string, string> = {
  chaos: "Any chaotic",
  evil: "Any evil",
  good: "Any good",
  law: "Any lawful",
};

/** Prerequisites recognized, which no requirement says: left unresolved. */
const UNRESOLVED_PREREQUISITES = [/[Pp]roficien(?:t|cy) with (?:selected )?(?:weapon|armor)/, /[Aa]bility to fly\b/];

/** A feat's ability score requirements: "Str 13", "Dex 15". */
function abilityScoreRequirements(text: string): RequirementEntry[] {
  const reqs: RequirementEntry[] = [];
  const abilityRegex = /\b(Str|Dex|Con|Int|Wis|Cha)\s+(\d+)/gi;
  let abilityMatch: RegExpExecArray | null;
  while ((abilityMatch = abilityRegex.exec(text)) !== null) {
    const ability = ABILITY_ABBREVIATIONS[abilityMatch[1].toLowerCase()];
    if (ability) reqs.push(gte(`abilities.${ability}.total`, parseInt(abilityMatch[2], 10)));
  }
  return reqs;
}

/** A feat's base save requirements: "Base Fortitude save bonus +2". */
function baseSaveRequirements(text: string): RequirementEntry[] {
  const reqs: RequirementEntry[] = [];
  const baseSaveRegex = /[Bb]ase\s+(Fortitude|Reflex|Will)\s+save\s+bonus\s+\+(\d+)/gi;
  let baseSaveMatch: RegExpExecArray | null;
  while ((baseSaveMatch = baseSaveRegex.exec(text)) !== null) {
    const save = SAVE_SLUGS[baseSaveMatch[1].toLowerCase()];
    if (save) reqs.push(gte(`saves.${save}.base`, parseInt(baseSaveMatch[2], 10)));
  }
  return reqs;
}

/** A feat's spellcasting requirements: "Caster level Nth", then "Ability to cast (Nth-level) arcane/divine spells". */
function castingRequirements(text: string): RequirementEntry[] {
  const reqs: RequirementEntry[] = [];
  // Caster level: "Caster level Nth"
  const casterMatch = text.match(/[Cc]aster level (\d+)(?:st|nd|rd|th)/);
  if (casterMatch) {
    const level = parseInt(casterMatch[1], 10);
    reqs.push(or(gte("spellcasting.arcane", level), gte("spellcasting.divine", level)));
  }

  // Able to cast spells: "Ability to cast arcane spells" or specific level
  const castMatch = text.match(
    /[Aa](?:bility|ble) to cast (?:(\d+)(?:st|nd|rd|th)[- ]level )?(arcane|divine)?\s*spells/i,
  );
  if (castMatch) {
    const level = castMatch[1] ? parseInt(castMatch[1], 10) : 1;
    const type = castMatch[2]?.toLowerCase();
    if (type === "arcane") reqs.push(gte("spellcasting.arcane", level));
    else if (type === "divine") reqs.push(gte("spellcasting.divine", level));
    else reqs.push(or(gte("spellcasting.arcane", level), gte("spellcasting.divine", level)));
  }
  return reqs;
}

/**
 * A feat's class ability prerequisites, each the class feature feats that give it (`CLASS_ABILITY_PREREQUISITES`, in
 * order): a text one matched is no longer read by the ones after.
 */
function classAbilityRequirements(text: string): RequirementEntry[] {
  const reqs: RequirementEntry[] = [];
  let abilityText = text;
  for (const { pattern, resolve } of CLASS_ABILITY_PREREQUISITES) {
    const match = abilityText.match(pattern);
    if (match) {
      const result = resolve(match);
      if (result) {
        if (Array.isArray(result)) reqs.push(...result);
        else reqs.push(result);
      }
      abilityText = abilityText.replace(match[0], "");
    }
  }
  return reqs;
}

/** A feat's class level requirements: "fighter level 4th", "Wizard level 1st", "Character Level 6" (overall). */
function classLevelRequirements(text: string): RequirementEntry[] {
  const reqs: RequirementEntry[] = [];
  const classLevelRegex = /(\w+)\s+level\s+(\d+)(?:st|nd|rd|th)?/gi;
  let classLevelMatch: RegExpExecArray | null;
  while ((classLevelMatch = classLevelRegex.exec(text)) !== null) {
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
  return reqs;
}

/** The feats a feat's benefit or special text implies it requires: "already have applied the Spell Focus feat". */
function impliedFeatNames(entry: FeatReference["raw"][number]): string[] {
  const feats: string[] = [];
  const text = entry.benefit + " " + (entry.special ?? "");

  // "already have applied the X feat"
  const appliedMatch = text.match(/already (?:have )?applied the\s+([A-Z][A-Za-z\s]+?)\s+feat/i);
  if (appliedMatch) feats.push(titleCaseFeat(appliedMatch[1].trim()));

  return feats;
}

function isCommonPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  if (
    /^(or|any|must|have|the|can|has|level|none|proficient|proficiency|ability|able|size|medium|large|small|tiny|at least|damage|innate)/.test(
      lower,
    )
  )
    return true;
  // "X class ability" / "X class feature" — these are class features, not feats
  if (/\bclass (?:ability|feature)\b/i.test(lower)) return true;
  // "Spell-like ability at caster level X or higher" — not a feat
  if (/^spell-like ability/i.test(lower)) return true;
  return false;
}

/** The feats a feat's prerequisite text names, its other prerequisites (abilities, ranks, levels…) left out. */
function listedFeatNames(text: string): string[] {
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
    .replace(
      /\b(?:Fine|Diminutive|Tiny|Small|Medium|Large|Huge|Gargantuan|Colossal)\s+(?:or\s+(?:Fine|Diminutive|Tiny|Small|Medium|Large|Huge|Gargantuan|Colossal|smaller)\s+)?size\b/gi,
      "",
    )
    .replace(/must be[^,.]+/gi, "")
    .trim();

  // Split remaining text on comma boundaries
  const parts = cleaned.split(/,\s*/);

  for (const part of parts) {
    let trimmed = part
      .trim()
      .replace(/\.$/, "")
      .replace(/^and\s+/i, "");
    if (!trimmed || trimmed.length < 3) continue;

    // Strip weapon/school qualifiers — refers to the template family feat
    trimmed = trimmed
      .replace(/\s*\(?with (?:selected |the )?(?:weapon|school)(?:\s+chosen)?\)?$/i, "")
      .replace(/\s+(?:in|of) the (?:chosen|selected|same) (?:school|weapon)$/i, "");

    // A feat name: starts with uppercase, at least 2 chars, not a common phrase or class ability
    if (trimmed.match(/^[A-Z][a-zA-Z]/) && !isCommonPhrase(trimmed)) {
      const titled = titleCaseFeat(trimmed);
      if (!ABILITY_PREREQ_PATTERNS.some((p) => p.test(titled))) feats.push(stripFeatChoice(titled) ?? titled);
    }
  }

  return feats;
}

/** A feat's size requirements: "Small or Medium size", "Medium or smaller size", "Small size". */
function sizeRequirements(text: string): RequirementEntry[] {
  const reqs: RequirementEntry[] = [];
  const sizeNames = SIZE_OPTIONS.join("|");

  // "X or Y size"
  const explicitSizeMatch = text.match(new RegExp(`\\b(${sizeNames})\\s+or\\s+(${sizeNames})\\s+size`, "i"));
  if (explicitSizeMatch) {
    const s1 = SIZE_OPTIONS.find((s) => s.toLowerCase() === explicitSizeMatch[1].toLowerCase())!;
    const s2 = SIZE_OPTIONS.find((s) => s.toLowerCase() === explicitSizeMatch[2].toLowerCase())!;
    reqs.push(or(eqStr(RACE_SIZE_PATH, s1), eqStr(RACE_SIZE_PATH, s2)));
  }

  // "X or smaller size"
  const orSmallerMatch =
    !explicitSizeMatch && text.match(new RegExp(`\\b(${sizeNames})\\s+or\\s+smaller\\s+size`, "i"));
  if (orSmallerMatch) {
    const maxSize = SIZE_OPTIONS.find((s) => s.toLowerCase() === orSmallerMatch[1].toLowerCase())!;
    const maxIdx = SIZE_OPTIONS.indexOf(maxSize);
    const sizes = SIZE_OPTIONS.slice(0, maxIdx + 1);
    reqs.push(or(...sizes.map((s) => eqStr(RACE_SIZE_PATH, s))));
  }

  // "X size" (standalone)
  const exactSizeMatch =
    !explicitSizeMatch && !orSmallerMatch && text.match(new RegExp(`\\b(${sizeNames})\\s+size\\b`, "i"));
  if (exactSizeMatch) {
    const size = SIZE_OPTIONS.find((s) => s.toLowerCase() === exactSizeMatch[1].toLowerCase())!;
    reqs.push(eqStr(RACE_SIZE_PATH, size));
  }
  return reqs;
}

/** A feat's skill rank requirements: "SkillName N ranks", "Knowledge (any)" any Knowledge skill. */
function skillRankRequirements(text: string): RequirementEntry[] {
  const reqs: RequirementEntry[] = [];
  const skillRegex = /([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*(?:\s*\([^)]+\))?)\s+(\d+)\s+ranks?/gi;
  let skillMatch: RegExpExecArray | null;
  while ((skillMatch = skillRegex.exec(text)) !== null) {
    const name = skillMatch[1].trim();
    const ranks = parseInt(skillMatch[2], 10);
    // Skip false positives
    if (name.match(/^(Base|Must|Any|Or|And|The|Can|Has|Level)$/i)) continue;

    // "Knowledge (any)" → OR of all Knowledge skills; else the skill, or its base skill for a specialization
    reqs.push(readAnySkillRequirement(name, ranks) ?? gte(`skills.${toSkillSlug(name)}.rank`, ranks));
  }
  return reqs;
}

/**
 * A feat's spellcasting ability requirement, "Spellcasting ability (Int or Cha) 15" → or(Int ≥ 15, Cha ≥ 15), and the
 * text it was read from (`matched`), which no feat is read from.
 */
function spellcastingAbilityRequirements(text: string): { matched?: string; requirements: RequirementEntry[] } {
  const spellcastingAbilityMatch = text.match(/[Ss]pellcasting ability\s*\(([^)]+)\)\s*(\d+)/);
  if (!spellcastingAbilityMatch) return { requirements: [] };
  const options = spellcastingAbilityMatch[1]
    .split(/,\s*(?:or\s+)?|\s+or\s+/)
    .map((o) => o.trim())
    .filter(Boolean);
  const value = parseInt(spellcastingAbilityMatch[2], 10);
  const children = options
    .map((o) => ABILITY_ABBREVIATIONS[o.toLowerCase()])
    .filter((a): a is string => !!a)
    .map((a) => gte(`abilities.${a}.total`, value));
  const requirements = children.length > 1 ? [or(...children)] : children.length === 1 ? [children[0]] : [];
  return { requirements, matched: spellcastingAbilityMatch[0] };
}

function titleCaseFeat(s: string): string {
  // Most feat names from SRD are already in a reasonable case
  // Just ensure first letter of each word is uppercase
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * A feat's prerequisites, read from its prerequisite text, and the alignment and the feats its other text asks: the
 * requirements they give, and the feats they name, by their slugs (`featNames`), which a template's checks find its
 * family's feats by.
 */
export class FeatPrerequisites extends RequirementReading {
  constructor(entry: FeatReference["raw"][number]) {
    super();
    this.readPrerequisiteText(entry.prerequisiteText);
    this.keepValidRequirements();
    this.addRelevantAlignment(entry);
    this.addImpliedFeats(entry);
  }

  /** The feats the prerequisites name, by their slugs. */
  readonly featNames: Record<string, string> = {};

  /** The feats the feat's benefit or special text implies it requires, but those its prerequisites name. */
  private addImpliedFeats(entry: FeatReference["raw"][number]) {
    for (const name of impliedFeatNames(entry))
      if (!this.featNames[stripSeparators(name)]) this.requirements.push(this.featRequirement(name));
  }

  /** "Relevant alignment" (Spell Focus (Chaos), (Evil)…): an alignment of the feat's. */
  private addRelevantAlignment(entry: FeatReference["raw"][number]) {
    const relevantAlignment = /\brelevant alignment\b/i.test(entry.prerequisiteText ?? "")
      ? RELEVANT_ALIGNMENTS[/\((\w+)\)$/.exec(entry.name)?.[1].toLowerCase() ?? ""]
      : undefined;
    const alignment = relevantAlignment && readAlignmentRequirement(relevantAlignment);
    if (alignment) this.requirements.push(alignment);
  }

  /** The check that the character has the feat `name`, which the prerequisites name. */
  private featRequirement(name: string): RequirementEntry {
    this.featNames[stripSeparators(name)] = name;
    return eq(feat(name));
  }

  /** The feats a prerequisite lists, split on commas but not inside parentheses. */
  private listedFeatRequirements(text: string): RequirementEntry[] {
    // Strip numeric/dice suffixes (e.g. "Sudden Strike +8d6" → "Sudden Strike")
    // and book abbreviation suffixes (e.g. "Brutal Throw (CAd)" → "Brutal Throw")
    return listedFeatNames(text).map((name) =>
      this.featRequirement(name.replace(/\s*\+\d+(?:d\d+)?$/, "").replace(BOOK_ABBREV_PATTERN, "")),
    );
  }

  /**
   * A prerequisite's multi-option feats, "Weapon Focus (heavy mace, morningstar, or greatclub)" →
   * or(eq(feat("Weapon Focus: Heavy Mace")), …); and `featText` without them, so the feats it lists aren't read from
   * their fragments.
   */
  private multiOptionFeatRequirements(
    text: string,
    featText: string,
  ): { featText: string; requirements: RequirementEntry[] } {
    const reqs: RequirementEntry[] = [];
    const multiOptionFeatRegex = /([A-Z][a-zA-Z ]+?)\s*\(([a-z][^)]*(?:,|or)[^)]+)\)/g;
    let multiMatch: RegExpExecArray | null;
    while ((multiMatch = multiOptionFeatRegex.exec(text)) !== null) {
      const featBase = titleCaseFeat(multiMatch[1].trim());
      // "Ability to fly (naturally, magically, or through shapechanging)" names no feat
      if (isCommonPhrase(featBase)) continue;
      const options = readFamilyOptions(featBase, multiMatch[2]);
      if (options.length >= 2) {
        reqs.push(or(...options.map((opt) => this.featRequirement(`${featBase}: ${titleCaseFeat(opt)}`))));
        // Strip this match so listedFeatNames doesn't also parse partial fragments
        featText = featText.replace(multiMatch[0], "");
      }
    }
    return { requirements: reqs, featText };
  }

  /** The requirements a feat's prerequisite text gives, in its order, and what it names that none can say. */
  private readPrerequisiteText(text: string) {
    if (!text || text === "-" || text === "None" || text === "none") return;

    // Strip book abbreviation suffixes (e.g., "Dodge (PH)" → "Dodge") and
    // conditional parenthetical qualifiers: "(plus Str 13 for ...)" and "(or)" artifacts
    const cleanedText = text
      .replace(new RegExp(BOOK_ABBREV_PATTERN.source, "g"), "")
      .replace(/\s*\(plus [^)]+\)/gi, "")
      .replace(/\s*\(or\)/gi, "");
    const reqs = this.requirements;

    // BAB (tolerates "++N" scraping artifacts)
    const babMatch = cleanedText.match(/(?:Base attack bonus|BAB)[:\s]+\+{1,2}(\d+)/i);
    if (babMatch) reqs.push(gte("combat.bab", parseInt(babMatch[1], 10)));

    reqs.push(...baseSaveRequirements(cleanedText));
    reqs.push(...sizeRequirements(cleanedText));
    reqs.push(...abilityScoreRequirements(cleanedText));

    const spellcastingAbility = spellcastingAbilityRequirements(cleanedText);
    reqs.push(...spellcastingAbility.requirements);
    const multiOption = this.multiOptionFeatRequirements(
      cleanedText,
      spellcastingAbility.matched ? cleanedText.replace(spellcastingAbility.matched, "") : cleanedText,
    );
    reqs.push(...multiOption.requirements);

    // Feat prerequisites — split on commas but respect parentheses
    reqs.push(...this.listedFeatRequirements(multiOption.featText));
    reqs.push(...castingRequirements(cleanedText));
    reqs.push(...classLevelRequirements(cleanedText));
    reqs.push(...skillRankRequirements(cleanedText));

    // Class ability prerequisites — map to actual class feature feats
    reqs.push(...classAbilityRequirements(cleanedText));

    // Shield proficiency prerequisites
    if (/[Pp]roficien(?:t|cy) with (?:a )?(?:heavy )?shield/i.test(cleanedText))
      reqs.push(this.featRequirement("Shield Proficiency"));

    reqs.push(...readFamilyFeatRequirements(cleanedText));

    // Detect prerequisite patterns we recognize but can't map to requirement entries
    for (const pattern of UNRESOLVED_PREREQUISITES) {
      const match = cleanedText.match(pattern);
      if (match) this.unresolved.push(match[0]);
    }
  }
}
