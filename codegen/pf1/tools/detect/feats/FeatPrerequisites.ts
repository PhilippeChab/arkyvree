import { FAMILY_OPTIONS, findOptionName } from "@/codegen/pf1/tools/terms/featOptions.ts";
import { ABILITY_ABBREVIATIONS, FEAT_SYNONYMS, NUMBER_WORDS } from "@/codegen/pf1/tools/terms/featWords.ts";
import { eq, gte, or } from "@/content/core/builders/customization/requirements.ts";
import type { RequirementEntry } from "@/content/core/builders/customization/types.ts";
import { feat } from "@/content/pf1/builders/feats/possession.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { stripSeparators } from "@/shared/text.ts";
import { CLASS_FEATURE_FAMILIES, FEAT_FAMILIES } from "@/vocabulary/pf1/feats.ts";
import { SKILL_NAMES } from "@/vocabulary/pf1/skills.ts";

import FeatTargetPaths from "./FeatTargetPaths.ts";

/** A part of a prerequisite, read: the requirements it gives, `undefined` when the reading doesn't take it. */
type PartReading = RequirementEntry[] | undefined;

/** What a feat's prerequisites are read against: the book's feats, and the family the feat leads, if it's one. */
export interface PrerequisiteContext {
  /** The book's feats, by their names as the content names them. */
  bookFeats: ReadonlySet<string>;
  /** The family of feats taken for an option the feat leads (Weapon Specialization), whose prerequisites are an option's. */
  family?: string;
}

/** An ordinal's number: "4th", "1st" → 4, 1. */
const ORDINAL = String.raw`(\d+)(?:st|nd|rd|th)`;

/** The parts of a prerequisite: its commas' and its last "and"'s, but inside parentheses; each without its period. */
function splitParts(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") {
      depth++;
    } else if (text[i] === ")") {
      depth = Math.max(0, depth - 1);
    } else if (text[i] === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts
    .map((part) =>
      part
        .trim()
        .replace(/\.$/, "")
        .replace(/^and\s+/i, ""),
    )
    .filter(Boolean);
}

/**
 * A feat's prerequisites, read from its Prerequisites text: the requirements its parts give (its abilities, its base
 * attack bonus, its feats, its levels, its ranks, its spellcasting, its class features), and the parts no requirement
 * says (`unresolved`), for review. A part read into a path no character has is unresolved too, its path an error. A
 * feat that leads a family (`context.family`) names its feats of the option taken by their family's name ("Weapon
 * Focus with selected weapon"), which `featNames` keeps for its generated code, and asks proficiency with its weapon
 * (`proficient`).
 */
export class FeatPrerequisites {
  constructor(
    text: string | undefined,
    private readonly context: PrerequisiteContext,
  ) {
    for (const part of splitParts(text ?? "")) this.readPart(part);
  }

  /** The paths read that no requirement can check. */
  readonly errors: string[] = [];
  /** The feats the prerequisites name, by their slugs: a family's, which its generated code names the option's of. */
  readonly featNames: Record<string, string> = {};
  /** What the parts read only in part leave unchecked, for review. */
  readonly partlyRead: string[] = [];
  /** The requirements the prerequisites give, in their order. */
  readonly requirements: RequirementEntry[] = [];
  /** The parts no requirement says. */
  readonly unresolved: string[] = [];
  /** Whether the prerequisites ask proficiency with the weapon the feat is taken for. */
  proficient = false;

  /** An ability score: "Str 13". */
  private ability(part: string): PartReading {
    const [, abbreviation, score] = /^(Str|Dex|Con|Int|Wis|Cha) (\d+)$/.exec(part) ?? [];
    const ability = abbreviation && ABILITY_ABBREVIATIONS[abbreviation.toLowerCase()];
    return ability ? [gte(`abilities.${ability}.total`, Number(score))] : undefined;
  }

  /** Any feats of a family the rules name: "any two critical feats", "any metamagic feat". */
  private anyFamilyFeats(part: string): PartReading {
    const [, count, family] = /^any (?:(\w+) )?(.+?) feats?$/i.exec(part) ?? [];
    const named = FEAT_FAMILIES.find((name) => name.toLowerCase() === family?.toLowerCase());
    if (!named) return undefined;
    const slug = stripSeparators(named);
    const times = count ? NUMBER_WORDS[count.toLowerCase()] : undefined;
    return [times ? gte(`feats.${slug}.count`, times) : eq(`feats.${slug}.*.possessed`)];
  }

  /** The base attack bonus: "base attack bonus +6". */
  private baseAttackBonus(part: string): PartReading {
    const [, bonus] = /^base attack bonus \+(\d+)$/i.exec(part) ?? [];
    return bonus ? [gte("combat.bab", Number(bonus))] : undefined;
  }

  /** The caster level: "caster level 5th", of any spellcasting class. */
  private casterLevel(part: string): PartReading {
    const [, level] = new RegExp(`^caster level ${ORDINAL}$`, "i").exec(part) ?? [];
    return level ? [gte("spellcasting.casterlevel", Number(level))] : undefined;
  }

  /** Spells of a kind: "Ability to cast arcane spells", from 1st level. */
  private casting(part: string): PartReading {
    const [, kind] = /^ability to cast (arcane|divine) spells$/i.exec(part) ?? [];
    return kind ? [gte(`spellcasting.${kind.toLowerCase()}`, 1)] : undefined;
  }

  /**
   * The character's level, or a class's: "Character level 7th", "14th-level fighter", "fighter level 4th".
   */
  private characterOrClassLevel(part: string): PartReading {
    const [, characterLevel] = new RegExp(`^character level ${ORDINAL}$`, "i").exec(part) ?? [];
    if (characterLevel) return [gte("identity.meta.level", Number(characterLevel))];
    const before = new RegExp(`^${ORDINAL}-level ([a-z]+)$`, "i").exec(part);
    const after = new RegExp(`^([a-z]+) level ${ORDINAL}$`, "i").exec(part);
    const [className, level] = before ? [before[2], before[1]] : after ? [after[1], after[2]] : [];
    return className ? [gte(`classes.${stripSeparators(className)}.level`, Number(level))] : undefined;
  }

  /**
   * A class feature, any class's of its family: "Channel energy class feature", "Ability to channel energy", "Ki pool
   * class feature". Channeling one kind of energy ("Channel negative energy class feature") is read as channeling any:
   * which kind a class channels is no path, so the kind is left to review.
   */
  private classFeature(part: string): PartReading {
    if (!/^ability to |\bclass feature$/i.test(part)) return undefined;
    const named = part.replace(/^ability to /i, "").replace(/\s+class feature$/i, "");
    const [, energy] = /^channel (positive|negative) energy$/i.exec(named) ?? [];
    const featureName = energy ? "channel energy" : named;
    const family = CLASS_FEATURE_FAMILIES.find((name) => name.toLowerCase() === featureName.toLowerCase());
    if (!family) return undefined;
    if (energy) this.partlyRead.push(`"${part}" read as any channel energy: its kind isn't checked`);
    return [eq(`feats.${stripSeparators(family)}.*.possessed`)];
  }

  /**
   * A feat, as the content names it: one of a family's for an option ("Spell Focus (conjuration)"); its family's feat
   * for the option the feat is taken for ("Weapon Focus with selected weapon"), or, named alone, any of the family's
   * ("Weapon Focus" in Penetrating Strike's); or the book's feat of its name or its synonym's.
   */
  private featNamed(part: string): PartReading {
    const [, family, option] = /^(.+?) \((.+)\)$/.exec(part) ?? [];
    const options = family ? FAMILY_OPTIONS[family] : undefined;
    const optionName = options && findOptionName(option, options.names);
    if (optionName) return [eq(feat(`${family}: ${optionName}`))];
    const name = part.replace(/ with (?:the )?selected weapon$/i, "");
    const featName = FEAT_SYNONYMS[name] ?? (this.context.bookFeats.has(name) ? name : undefined);
    if (!featName) return undefined;
    if (FAMILY_OPTIONS[featName] && !this.context.family) return [eq(`feats.${stripSeparators(featName)}.*.possessed`)];
    this.featNames[stripSeparators(featName)] = featName;
    return [eq(feat(featName))];
  }

  /**
   * Alternatives, "Catch Off-Guard or Throw Anything": any of those read. One no reading takes is left to review
   * ("Exotic Weapon Proficiency (firearm)": the book has no firearm).
   */
  private oneOf(part: string): PartReading {
    const alternatives = part.split(/\s+or\s+/);
    if (alternatives.length < 2) return undefined;
    const read = alternatives.flatMap((alternative) => {
      const requirements = this.readAlternative(alternative);
      if (!requirements) this.unresolved.push(alternative);
      return requirements ?? [];
    });
    if (read.length === 0) return [];
    return read.length === 1 ? read : [or(...read)];
  }

  /**
   * Proficiency with the weapon the feat is taken for: "Proficiency with selected weapon", "proficient with weapon",
   * "Weapon Proficiency (crossbow type chosen)". A feat of no family that asks it is taken with a weapon its Weapon
   * Focus is in, whose own prerequisites ask it: it gives no requirement of its own.
   */
  private proficiency(part: string): PartReading {
    if (!/^proficien(?:cy|t) with (?:the )?(?:selected )?weapon$|^weapon proficiency \(.+ chosen\)$/i.test(part))
      return undefined;
    if (this.context.family) this.proficient = true;
    return [];
  }

  /** An alternative of a prerequisite's part, read as a part is but by `oneOf`, which would split it again. */
  private readAlternative(part: string): PartReading {
    return (
      this.ability(part) ??
      this.baseAttackBonus(part) ??
      this.casterLevel(part) ??
      this.characterOrClassLevel(part) ??
      this.skillRanks(part) ??
      this.casting(part) ??
      this.classFeature(part) ??
      this.proficiency(part) ??
      this.anyFamilyFeats(part) ??
      this.featNamed(part)
    );
  }

  /** A part of the prerequisites, read into its requirements, or left to review when no reading takes it. */
  private readPart(part: string) {
    const requirements = this.readAlternative(part) ?? this.oneOf(part);
    if (!requirements) {
      this.unresolved.push(part);
      return;
    }
    const invalid = requirements.flatMap((requirement) => FeatTargetPaths.invalidRequirementPaths(requirement));
    if (invalid.length === 0) this.requirements.push(...requirements);
    else this.errors.push(...invalid.map((path) => `${part}: no path "${path}"`));
  }

  /**
   * A skill's ranks: "Ride 1 rank", or any of several skills' ("5 ranks in any Craft or Profession skill").
   */
  private skillRanks(part: string): PartReading {
    const [, skill, ranks] = /^([A-Z][A-Za-z ()]+?) (\d+) ranks?$/.exec(part) ?? [];
    const [, anyRanks, anySkills] = /^(\d+) ranks in any (.+?) skill$/i.exec(part) ?? [];
    const names = skill ? [skill] : (anySkills?.split(/\s+or\s+/) ?? []);
    if (names.length === 0 || !names.every((name) => isOneOf(name, SKILL_NAMES))) return undefined;
    const checks = names.map((name) => gte(`skills.${stripSeparators(name)}.rank`, Number(ranks ?? anyRanks)));
    return checks.length === 1 ? checks : [or(...checks)];
  }
}
