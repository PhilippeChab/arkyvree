import type { LabeledText } from "@/codegen/pf1/tools/types/pages.ts";
import { eq, eqStr, gte, or } from "@/content/core/builders/customization/requirements.ts";
import type { RequirementEntry } from "@/content/core/builders/customization/types.ts";
import { feat } from "@/content/pf1/builders/feats/possession.ts";
import { language } from "@/content/pf1/builders/languages/knowledge.ts";
import { stripSeparators } from "@/shared/text.ts";
import { ALIGNMENT_OPTIONS } from "@/vocabulary/pf1/identity.ts";
import { KNOWLEDGE_SKILLS, SKILL_NAMES } from "@/vocabulary/pf1/skills.ts";

import { splitList } from "./lists.ts";

/** The character's alignment, which an alignment requirement checks. */
const ALIGNMENT_PATH = "identity.beliefs.alignment";

/** A spellcasting requirement read whole: spells of a level and a kind, one kind or two ("…and 2nd-level arcane spells"). */
const PLAIN_CASTING =
  /^(?:able|ability) to cast \d+(?:st|nd|rd|th)-level (?:arcane|divine) spells(?: and \d+(?:st|nd|rd|th)-level (?:arcane|divine) spells)?\.?$/i;

/** The skills by their name, lowercased. */
const SKILLS_BY_NAME = new Map<string, string>(SKILL_NAMES.map((name) => [name.toLowerCase(), name]));

/**
 * The alignments an alignment line names ("Any nonlawful", "Any neutral", "Lawful good"): none for "Any", nor for a
 * line naming none (a cleric's deity's).
 */
function alignmentsOf(text: string): string[] {
  const line = text.toLowerCase().replace(/\.$/, "").trim();
  const none = /^any non(\w+)$/.exec(line)?.[1];
  if (none) return ALIGNMENT_OPTIONS.filter((alignment) => !alignment.toLowerCase().includes(none));
  const some = /^any (\w+)$/.exec(line)?.[1];
  if (some) return ALIGNMENT_OPTIONS.filter((alignment) => alignment.toLowerCase().includes(some));
  return ALIGNMENT_OPTIONS.filter((alignment) => alignment.toLowerCase() === line);
}

/** A skill a requirement names: its own, or its base skill's for a specialization ("Perform (dance)": Perform). */
function skillOf(name: string): string | undefined {
  const lower = name.toLowerCase();
  return SKILLS_BY_NAME.get(lower) ?? SKILLS_BY_NAME.get(lower.replace(/\s*\([^)]*\)$/, ""));
}

/** A name's words capitalized: "longbow" → "Longbow". */
function titleCase(name: string): string {
  return name.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/**
 * A class's requirements, its lines read, each by its label: its alignment, base attack bonus, skill ranks, feats,
 * weapon proficiency, spellcasting (spells of a level and kind: `spellcasting.arcane` is the highest arcane spell
 * level cast), languages and special requirements (sneak attack dice). What a line asks that none of them reads is
 * unread, its label first: a line read only in part is too.
 */
export class ClassRequirements {
  constructor(lines: LabeledText[], feats: ReadonlySet<string>) {
    this.feats = feats;
    for (const { label, text } of lines) this.read(label, text);
  }

  /** The feats a requirement can name: its book's. */
  private readonly feats: ReadonlySet<string>;
  /** The requirements read. */
  private readonly requirements: RequirementEntry[] = [];
  /** What no reading takes, by its label. */
  private readonly unplaced: string[] = [];

  /** An alignment line's requirement: any of the alignments it names. */
  private alignment(text: string): RequirementEntry[] {
    if (/^any\.?$/i.test(text.trim())) return [];
    const checks = alignmentsOf(text).map((alignment) => eqStr(ALIGNMENT_PATH, alignment));
    return checks.length > 1 ? [or(...checks)] : checks;
  }

  /**
   * A spellcasting line's requirements: the spell level it names, of each kind it names ("2nd-level divine spells and
   * 2nd-level arcane spells"), of either kind when it names none ("seven different divination spells").
   */
  private casting(text: string): RequirementEntry[] {
    const level = parseInt(/\b(\d+)(?:st|nd|rd|th)[- ]level\b/.exec(text)?.[1] ?? "1", 10);
    const kinds = [...new Set([...text.toLowerCase().matchAll(/\b(arcane|divine)\b/g)].map((match) => match[1]))];
    if (kinds.length === 0) return [or(gte("spellcasting.arcane", level), gte("spellcasting.divine", level))];
    return kinds.map((kind) => gte(`spellcasting.${kind}`, level));
  }

  /**
   * A feat a feats line names, as a requirement: the feat, one of a family's options ("Weapon Focus (longbow or
   * shortbow)"), or Skill Focus in any Knowledge skill; none for a feat its book doesn't have.
   */
  private feat(name: string): RequirementEntry | undefined {
    if (/^Skill Focus \(Knowledge \[any/i.test(name))
      return or(...KNOWLEDGE_SKILLS.map((skill) => eq(feat(`Skill Focus: ${skill}`))));
    const family = /^(.+?) \((.+)\)$/.exec(name);
    if (family && this.feats.has(family[1])) {
      const options = family[2].split(/,? or |, /).map(titleCase);
      return or(...options.map((option) => eq(feat(`${family[1]}: ${option}`))));
    }
    return this.feats.has(name) ? eq(feat(name)) : undefined;
  }

  /** `label`'s line read into its requirements, what none takes unread. */
  private read(label: string, text: string) {
    const read = this.readers(label, text);
    if (!read) {
      this.unplaced.push(`${label}: ${text}`);
      return;
    }
    this.requirements.push(...read.requirements);
    this.unplaced.push(...read.unread.map((part) => `${label}: ${part}`));
  }

  /** A line's requirements and what they leave unread, by its label: none for a label no reading takes. */
  private readers(label: string, text: string): { requirements: RequirementEntry[]; unread: string[] } | undefined {
    const items = splitList(text.replace(/\.$/, "")).map((item) => item.replace(/^plus /, ""));
    switch (label) {
      case "Alignment": {
        const requirements = this.alignment(text);
        return { requirements, unread: requirements.length === 0 && !/^any\.?$/i.test(text) ? [text] : [] };
      }
      case "Base Attack Bonus":
        return { requirements: [gte("combat.bab", parseInt(text, 10))], unread: [] };
      case "Feats":
        return this.readItems(items, (item) => this.feat(item));
      case "Languages":
        return this.readItems(items, (item) => (/^[A-Z][a-z]+$/.test(item) ? eq(language(item)) : undefined));
      case "Skills":
        return this.readItems(items, (item) => this.skill(item));
      case "Special":
        return this.readItems([text], (item) => this.special(item));
      case "Spells":
      case "Spellcasting":
        return { requirements: this.casting(text), unread: PLAIN_CASTING.test(text) ? [] : [`${text} (read in part)`] };
      case "Weapon Proficiency":
        return this.readItems([text], (item) => this.weaponProficiency(item));
      default:
        return undefined;
    }
  }

  /** Each of a line's items read by `read` into a requirement, and the items none reads. */
  private readItems(items: string[], read: (item: string) => RequirementEntry | undefined) {
    const requirements: RequirementEntry[] = [];
    const unread: string[] = [];
    for (const item of items) {
      const requirement = read(item);
      if (requirement) requirements.push(requirement);
      else unread.push(item);
    }
    return { requirements, unread };
  }

  /** A skill's ranks a skills line names ("Acrobatics 2 ranks", "Perform (dance) 2 ranks"): none for "any two". */
  private skill(item: string): RequirementEntry | undefined {
    const match = /^(.+?) (\d+) ranks?\b/.exec(item);
    const skill = match && skillOf(match[1]);
    return skill ? gte(`skills.${stripSeparators(skill)}.rank`, parseInt(match[2], 10)) : undefined;
  }

  /** A special requirement's: sneak attack's dice, every class's together ("Sneak attack +2d6"). */
  private special(text: string): RequirementEntry | undefined {
    const dice = /^sneak attack \+(\d+)d6\.?$/i.exec(text)?.[1];
    return dice ? gte("feats.sneakattack.count", parseInt(dice, 10)) : undefined;
  }

  /** A weapon proficiency's: with all simple or martial weapons. */
  private weaponProficiency(text: string): RequirementEntry | undefined {
    const group = /\ball (simple|martial) weapons\b/i.exec(text)?.[1];
    return group ? eq(feat(`${titleCase(group)} Weapon Proficiency`)) : undefined;
  }

  /** Its requirements, in its lines' order. */
  all(): RequirementEntry[] {
    return this.requirements;
  }

  /** What its lines ask that no reading takes, each its label first: "Special: Must have authored…". */
  unread(): string[] {
    return this.unplaced;
  }
}
