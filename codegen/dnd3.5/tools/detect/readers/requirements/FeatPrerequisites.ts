import { ABILITY_ABBREVIATIONS } from "@/codegen/dnd3.5/tools/terms/abilities.ts";
import { SAVE_SLUGS } from "@/codegen/dnd3.5/tools/terms/saves.ts";
import { BOOK_ABBREV_PATTERN } from "@/codegen/dnd3.5/tools/text/sanitize.ts";
import type { FeatReference } from "@/codegen/dnd3.5/tools/types/feats.ts";
import { eq, gte, or } from "@/content/core/builders/customization/requirements.ts";
import type { RequirementEntry } from "@/content/core/builders/customization/types.ts";
import { feat } from "@/content/dnd3.5/builders/feats/possession.ts";
import { stripSeparators } from "@/shared/text.ts";

import { RequirementReading } from "./RequirementReading.ts";

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
  /^ki strike \((?:lawful|magic)\)$/i,
  /^relevant alignment$/i,
  /^Weapon Proficiency\b/i,
];

/** An alignment a feat's prerequisite names ("Any good alignment", "nonevil alignment"), but the relevant one. */
const ALIGNMENT_PREREQUISITE = /\b(?:any )?(?:non-?)?(?:lawful|chaotic|good|evil|neutral) alignment\b/i;

/**
 * The class abilities a feat's prerequisite can name: the class features any class's of their family meets
 * (`classFeatureRequirement`), and those it reads a requirement of its own for, a lawful ki strike the monk level it
 * comes at, a favored enemy none (a class's own feature).
 */
const CLASS_ABILITY_PREREQUISITES: { pattern: RegExp; requirement?: () => RequirementEntry | undefined }[] = [
  { pattern: /[Aa]bility to (?:turn|rebuke)|[Tt]urn or rebuke undead ability|[Tt]urn or rebuke undead\b/ },
  { pattern: /[Ss]neak [Aa]ttack or [Ss]udden [Ss]trike \+(\d+)d\d+/ },
  { pattern: /[Ss]neak [Aa]ttack \+(\d+)d\d+/ },
  { pattern: /[Ss]neak [Aa]ttack ability/i },
  // Bare "Sneak Attack": having it
  { pattern: /[Ss]neak [Aa]ttack(?!\s*\+|\s*ability|\s*or)/ },
  { pattern: /[Ss]udden [Ss]trike \+(\d+)d\d+/ },
  { pattern: /[Gg]race \+\d+/ },
  { pattern: /[Ss]kirmish \+(\d+)d\d+/ },
  { pattern: /[Rr]age or frenzy ability/i },
  // "Smite ability", "ability to smite evil", "smite evil" (a "Smite evil class feature" is read as a class feature)
  { pattern: /[Ss]mite ability|(?:[Aa]bility to )?smite evil(?! class)/ },
  { pattern: /[Ff]lurry of blows ability/i },
  // "Wild shape ability", "Ability to use wild shape", "Wild shape" alone, but not "Wild shape class feature"
  { pattern: /[Ww]ild [Ss]hape ability|[Aa]bility to (?:use )?wild shape|[Ww]ild [Ss]hape(?=\s*(?:[,.]|$))/i },
  // Named in lower case, which no feat's name is: a capitalized "Bardic music" is read as the feat of its name, which the
  // generator makes a check of its family
  { pattern: /\bwild empathy\b/ },
  { pattern: /\bbardic music\b/ },
  { pattern: /\bki power\b/ },
  { pattern: /[Aa]bility to acquire a (?:new )?familiar/ },
  // A monk's ki strike is magic from monk level 4, lawful from monk level 10
  { pattern: /[Kk]i strike \(magic\)/, requirement: () => gte("classes.monk.level", 4) },
  { pattern: /[Kk]i strike \(lawful\)/, requirement: () => gte("classes.monk.level", 10) },
  { pattern: /[Ff]avored enemy ability/i, requirement: () => undefined },
];

/** A proficiency a feat's prerequisite names, but with a shield (Shield Proficiency): "Proficiency with the whip". */
const PROFICIENCY_PREREQUISITE = /[Pp]roficien(?:t|cy) with (?!(?:a )?(?:heavy )?shield)[^,.]+/;

/** The alignment "Relevant alignment" asks of a feat for an alignment's spells ("Spell Focus (Chaos)") */
const RELEVANT_ALIGNMENTS: Record<string, string> = {
  chaos: "Any chaotic",
  evil: "Any evil",
  good: "Any good",
  law: "Any lawful",
};

/**
 * A skill's ranks a feat's prerequisite names: "Hide 4 ranks", "Knowledge (any) 5 ranks", "Knowledge (arcana or
 * religion) 8 ranks", "Diplomacy or Intimidate 4 ranks". Its skill, then its ranks.
 */
const SKILL_RANKS =
  /([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*(?:\s*\([^)]+\))?(?:\s+or\s+[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*(?:\s*\([^)]+\))?)*)\s+(\d+)\s+ranks?/gi;

/** Prerequisites recognized that no path reads: left unresolved, to be reviewed. Flight. */
const UNRESOLVED_PREREQUISITES = [/[Aa]bility to fly\b/];

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
  // "X class ability" / "X class feature" — these are class features, not feats (`unreadClassFeatures`)
  if (/\bclass (?:ability|feature)\b/i.test(lower)) return true;
  // "Spell-like ability at caster level X or higher" — not a feat
  if (/^spell-like ability/i.test(lower)) return true;
  return false;
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
 * The class features a feat's prerequisite text names ("Smite evil class feature", "Spell secret class ability") that
 * no class ability prerequisite reads (`CLASS_ABILITY_PREREQUISITES`).
 */
function unreadClassFeatures(text: string): string[] {
  return text
    .split(/,\s*/)
    .map((part) => part.trim().replace(/\.$/, ""))
    .filter(
      (part) =>
        /\bclass (?:ability|feature)\b/i.test(part) &&
        !CLASS_ABILITY_PREREQUISITES.some(({ pattern }) => pattern.test(part)),
    );
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
    const alignment = relevantAlignment && this.alignmentRequirement(relevantAlignment);
    if (alignment) this.requirements.push(alignment);
  }

  /**
   * An alignment a feat's prerequisite names, any of its kind ("good alignment", "nonevil alignment": any good, any
   * nonevil), as a check of the character's.
   */
  private anyAlignmentRequirements(text: string): RequirementEntry[] {
    const requirement = this.alignmentRequirement(/^any\b/i.test(text) ? text : `any ${text}`);
    return requirement ? [requirement] : [];
  }

  /**
   * A feat's caster level requirement: "Caster level Nth", as the highest spell level of either kind the character
   * casts, which no path reads a caster level as.
   */
  private casterLevelRequirements(text: string): RequirementEntry[] {
    const level = /[Cc]aster level (\d+)(?:st|nd|rd|th)/.exec(text)?.[1];
    return level ? [this.spellcastingOfEitherKind(parseInt(level, 10))] : [];
  }

  /**
   * A feat's class ability prerequisites (`CLASS_ABILITY_PREREQUISITES`, in order), a class feature any class's of its
   * family: a text one matched is no longer read by the ones after.
   */
  private classAbilityRequirements(text: string): RequirementEntry[] {
    const reqs: RequirementEntry[] = [];
    let abilityText = text;
    for (const { pattern, requirement } of CLASS_ABILITY_PREREQUISITES) {
      const match = abilityText.match(pattern);
      if (!match) continue;
      const read = requirement ? [requirement()] : this.classFeatureRequirements(match[0]);
      for (const entry of read) if (entry) reqs.push(entry);
      abilityText = abilityText.replace(match[0], "");
    }
    return reqs;
  }

  /** The check that the character has the feat `name`, which the prerequisites name. */
  private featRequirement(name: string): RequirementEntry {
    this.featNames[stripSeparators(name)] = name;
    return eq(feat(name));
  }

  /** The feats a feat's prerequisite text names, its other prerequisites (abilities, ranks, levels…) left out. */
  private listedFeatNames(text: string): string[] {
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
      .replace(SKILL_RANKS, "")
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
        if (!ABILITY_PREREQ_PATTERNS.some((p) => p.test(titled))) feats.push(this.featWithoutChoice(titled) ?? titled);
      }
    }

    return feats;
  }

  /**
   * The feats a prerequisite lists, split on commas but not inside parentheses: an exotic weapon's proficiency as its
   * item requires it, any of a feat's options ("Weapon Focus (any thrown weapon)"), or the feat.
   */
  private listedFeatRequirements(text: string): RequirementEntry[] {
    return this.listedFeatNames(text).flatMap((name) => {
      const proficiency = this.exoticProficiencyRequirements(name);
      if (proficiency.length > 0) return proficiency;
      if (this.asksAnyOption(name)) {
        const anyOption = this.anyFeatRequirement(name);
        if (!anyOption) this.unresolved.push(name);
        return anyOption ? [anyOption] : [];
      }
      // Strip numeric/dice suffixes (e.g. "Sudden Strike +8d6" → "Sudden Strike")
      // and book abbreviation suffixes (e.g. "Brutal Throw (CAd)" → "Brutal Throw")
      return [this.featRequirement(name.replace(/\s*\+\d+(?:d\d+)?$/, "").replace(BOOK_ABBREV_PATTERN, ""))];
    });
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
      const options = this.familyOptions(featBase, multiMatch[2]);
      if (options.length >= 2) {
        reqs.push(or(...options.map((opt) => this.featRequirement(`${featBase}: ${titleCaseFeat(opt)}`))));
        // Strip this match so listedFeatNames doesn't also parse partial fragments
        featText = featText.replace(multiMatch[0], "");
      }
    }
    return { requirements: reqs, featText };
  }

  /** The requirements `text` was read as, or `text` unresolved when it was read as none. */
  private readOrUnresolved(text: string, requirements: RequirementEntry[]) {
    if (requirements.length > 0) this.requirements.push(...requirements);
    else this.unresolved.push(text);
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
    reqs.push(...this.sizeRequirements(cleanedText));
    reqs.push(...abilityScoreRequirements(cleanedText));

    const spellcastingAbility = spellcastingAbilityRequirements(cleanedText);
    reqs.push(...spellcastingAbility.requirements);
    // A skill's options ("Knowledge (arcana or religion) 8 ranks") are its, read with its ranks: no feat's
    const multiOption = this.multiOptionFeatRequirements(
      cleanedText.replace(SKILL_RANKS, ""),
      spellcastingAbility.matched ? cleanedText.replace(spellcastingAbility.matched, "") : cleanedText,
    );
    reqs.push(...multiOption.requirements);

    // Feat prerequisites — split on commas but respect parentheses
    reqs.push(...this.listedFeatRequirements(multiOption.featText));
    reqs.push(...this.casterLevelRequirements(cleanedText));
    reqs.push(...this.castingRequirements(cleanedText));
    reqs.push(...classLevelRequirements(cleanedText));
    reqs.push(...this.skillRankRequirements(cleanedText));

    // Class ability prerequisites: any class's feature of their family
    reqs.push(...this.classAbilityRequirements(cleanedText));

    // Shield proficiency prerequisites
    if (/[Pp]roficien(?:t|cy) with (?:a )?(?:heavy )?shield/i.test(cleanedText))
      reqs.push(this.featRequirement("Shield Proficiency"));

    reqs.push(...this.familyFeatRequirements(cleanedText));

    // An alignment, a proficiency and the class features named "X class feature": read, or else unresolved
    const alignment = ALIGNMENT_PREREQUISITE.exec(cleanedText)?.[0];
    if (alignment) this.readOrUnresolved(alignment, this.anyAlignmentRequirements(alignment));
    const proficiency = PROFICIENCY_PREREQUISITE.exec(cleanedText)?.[0];
    if (proficiency) this.readOrUnresolved(proficiency, this.weaponProficiencyRequirements(proficiency));
    for (const feature of unreadClassFeatures(cleanedText))
      this.readOrUnresolved(feature, this.classFeatureRequirements(feature));

    // Prerequisite patterns recognized that no path reads
    for (const pattern of UNRESOLVED_PREREQUISITES) {
      const match = cleanedText.match(pattern);
      if (match) this.unresolved.push(match[0]);
    }
  }

  /** A feat's skill rank requirements (`SKILL_RANKS`), each read as a class's (`skillRankRequirement`). */
  private skillRankRequirements(text: string): RequirementEntry[] {
    const reqs: RequirementEntry[] = [];
    for (const [, skill, ranks] of text.matchAll(SKILL_RANKS)) {
      const name = skill.trim();
      // Skip false positives
      if (name.match(/^(Base|Must|Any|Or|And|The|Can|Has|Level)$/i)) continue;
      const requirement = this.skillRankRequirement(name, parseInt(ranks, 10));
      if (requirement) reqs.push(requirement);
    }
    return reqs;
  }
}
