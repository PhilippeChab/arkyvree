import { normalizeWs } from "@/codegen/core/text/whitespace.ts";
import { LEVELED_RANGES, SITE_ADDITIONS, SPELL_NAME_NUMERALS } from "@/codegen/pf1/tools/terms/spells.ts";
import type { SpellEntry } from "@/codegen/pf1/tools/types/spells.ts";
import type { SpellFields } from "@/content/pf1/builders/spells/types.ts";
import { capitalize } from "@/shared/text.ts";
import {
  SPELL_AREA_OF_EFFECT,
  SPELL_CASTING_TIME,
  SPELL_COMPONENT,
  SPELL_DESCRIPTOR,
  SPELL_DURATION,
  SPELL_EFFECT,
  SPELL_RANGE_TYPE,
  SPELL_RESISTANCE,
  SPELL_SCHOOL,
  SPELL_SUBSCHOOL,
  SPELL_TARGET,
} from "@/vocabulary/pf1/fields/index.ts";

import { SpellComponents } from "./SpellComponents.ts";
import { SpellLevels } from "./SpellLevels.ts";
import { SpellSchool } from "./SpellSchool.ts";

/** A field of what a spell acts on: its target, its effect or its area. */
type AimField = typeof SPELL_AREA_OF_EFFECT | typeof SPELL_EFFECT | typeof SPELL_TARGET;

/**
 * The fields a stat block's label of what a spell acts on fills, by its label's first word: a target ("Target",
 * "Targets", "Target or Area"), an effect, an area ("Area or Target"). A label naming two gives its text to the first.
 */
const AIM_FIELDS: [RegExp, AimField][] = [
  [/^Targets?\b/, SPELL_TARGET],
  [/^Effect\b/, SPELL_EFFECT],
  [/^Area\b/, SPELL_AREA_OF_EFFECT],
];

/** The stat block's labels a spell reads besides what it acts on. */
const READ_LABELS = [
  "Casting Time",
  "Components",
  "Duration",
  "Level",
  "Range",
  "Saving Throw",
  "School",
  "Spell Resistance",
];

/** A stat block's text as a field stores it: its whitespace normalized, its first letter capitalized ("Touch"). */
function statText(text: string): string {
  return capitalize(normalizeWs(text));
}

/**
 * A spell's page read into what its seed stores: its name as its book prints it, its description (its text, then what
 * its material component and focus are), its stat block's fields, each value one of its field's where the field
 * declares them, its saving throw, and its level on each Core Rulebook class's spell list. What its page gives that no
 * reading takes is listed (`unread`), for review; what the Core Rulebook has none of (later books' classes and
 * descriptors) is left out, and named (`otherClasses`, `leftOutDescriptors`).
 */
export class SpellDetector {
  constructor(private readonly entry: SpellEntry) {}

  /** What it acts on, by field: its target's, effect's and area's texts, of whichever labels its stat block gives. */
  private aims(): Partial<Record<AimField, string>> {
    const aims: Partial<Record<AimField, string>> = {};
    for (const [label, text] of Object.entries(this.entry.fields)) {
      const field = AIM_FIELDS.find(([pattern]) => pattern.test(label))?.[1];
      if (field) aims[field] = [aims[field], statText(text)].filter(Boolean).join("; ");
    }
    return aims;
  }

  /** Its stat block's components line read. */
  private components(): SpellComponents {
    return new SpellComponents(this.stat("Components"));
  }

  /** Its level line read. */
  private levels(): SpellLevels {
    return new SpellLevels(this.stat("Level"));
  }

  /** Its range as a field stores it: a range that grows with its caster's level as its word alone ("Close"). */
  private range(): string {
    const range = statText(this.stat("Range"));
    return LEVELED_RANGES.find((word) => range.startsWith(word)) ?? range;
  }

  /** Its school line read. */
  private school(): SpellSchool {
    return new SpellSchool(this.stat("School"));
  }

  /** Its stat block's text under `label`: none when it has none. */
  private stat(label: string): string {
    return this.entry.fields[label] ?? "";
  }

  /** Its level on each Core Rulebook class's spell list, by the list's aptitude ("Wizard Spells"). */
  aptitudeLevels(): Record<string, number> {
    return this.levels().levels();
  }

  /**
   * Its description: its text, then what its material component and focus are ("Material Component: …"). Its text
   * leaves out what the site adds to it (`SITE_ADDITIONS`), and parts the page joins with no space (its list's items:
   * "good results).Woe") are a sentence's apart.
   */
  description(): string {
    const text = SITE_ADDITIONS.reduce((result, addition) => result.replace(addition, ""), this.entry.description);
    const spaced = normalizeWs(text).replace(/([.!?])(?=[A-Z])/g, "$1 ");
    return [spaced, ...this.components().texts()].filter(Boolean).join(" ");
  }

  /**
   * Its stat block's fields, as stored, in the order its stat block gives them: its school, subschools and descriptors,
   * components, casting time, range, what it acts on, duration and spell resistance. A field its page leaves empty (a
   * range, a duration…) gives none, but a casting time, a standard action, and spell resistance, none (a spell on its
   * caster alone gives no line).
   */
  fields(): SpellFields {
    const school = this.school();
    const duration = statText(this.stat("Duration"));
    const fields: SpellFields = {
      ...(school.school() ? { [SPELL_SCHOOL]: school.school() } : {}),
      [SPELL_SUBSCHOOL]: school.subschools(),
      [SPELL_DESCRIPTOR]: school.descriptors(),
      [SPELL_COMPONENT]: this.components().names(),
      [SPELL_CASTING_TIME]: statText(this.stat("Casting Time") || "1 standard action"),
      [SPELL_RANGE_TYPE]: this.range(),
      ...this.aims(),
      [SPELL_DURATION]: duration,
      [SPELL_RESISTANCE]: statText(this.stat("Spell Resistance") || "no"),
    };
    return Object.fromEntries(Object.entries(fields).filter(([, value]) => value.length > 0));
  }

  /** The descriptors its school line gives that it leaves out: later books', and pointers to its text. */
  leftOutDescriptors(): string[] {
    return this.school().leftOut();
  }

  /** Its name as its book prints it: a numeral the site writes as a digit as its book does ("Summon Monster I"). */
  name(): string {
    return this.entry.name.replace(/ (\d)$/, (_, digit: string) => ` ${SPELL_NAME_NUMERALS[Number(digit)]}`);
  }

  /** The classes its level line names that the Core Rulebook has none of. */
  otherClasses(): string[] {
    return this.levels().others();
  }

  /** Its saving throw as written, its whitespace normalized: none when its stat block gives none. */
  savingThrow(): string {
    return normalizeWs(this.stat("Saving Throw"));
  }

  /** What its page gives that no reading takes: a label, a school line's value, a component, a class's level. */
  unread(): string[] {
    const labels = Object.keys(this.entry.fields).filter(
      (label) => !READ_LABELS.includes(label) && !AIM_FIELDS.some(([pattern]) => pattern.test(label)),
    );
    return [
      ...(this.stat("School") ? [] : ["no school"]),
      ...labels.map((label) => `label "${label}"`),
      ...this.school().unread(),
      ...this.components().unread(),
      ...this.levels().unread(),
    ];
  }
}
