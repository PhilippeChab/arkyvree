import { normalizeWs } from "@/codegen/core/text/whitespace.ts";
import { FEATURE_ALIASES, LEFT_OUT_FEATURES } from "@/codegen/pf1/tools/terms/classes.ts";
import type { ClassEntry } from "@/codegen/pf1/tools/types/classes.ts";

/** A feature as its page gives it, its text whole, and the sub-abilities its text heads that its table names. */
interface PageFeature {
  feature: ClassFeature;
  subs: ClassFeature[];
  text: string;
}

/** A class's feature, its table's entries naming it read: its name, its text, and the levels it's gained at. */
export interface ClassFeature {
  /** Whether its label names its kind ("Bravery (Ex)"): an ability of the class's own, not a feat it's named after. */
  ability: boolean;
  /** Its table's entries naming it ("bravery +1"), each at its level. */
  entries: { entry: string; level: number }[];
  /** The levels it's gained at, each once, in order. */
  levels: number[];
  /** Its name, its kind left out: "Bravery". */
  name: string;
  /** Its rules, its sub-abilities' left out (a bard's performances, features of their own). */
  text: string;
}

/** What a table's entry adds to a feature's name, at its end: a bonus, dice, a distance, uses a day, a rank. */
const ENTRY_SUFFIX = /\s+(?:\+?\d+(?:d\d+)?|\d+\/day|\d+ ft\.|\d+\/[-–—]|any distance|\([^)]*\))$/;

/** A sub-ability's heading in a feature's text, at a sentence's start: "Countersong (Su): ". */
const HEADING = /(?<=[.:;] )[A-Z][\w' -]+ \((?:Ex|Su|Sp)\): /;

/** A feature's kind, at its label's end: "(Ex)", "(Su)", "(Ex or Sp)". */
const KIND = /\s*\((?:Ex|Su|Sp)(?: or (?:Ex|Su|Sp))?\)$/;

/** The level a feature's text opens on gaining it at ("Beginning at 4th level, a paladin…"). */
const OPENING_LEVEL = /^(?:at|beginning at|starting at|upon reaching) (\d+)(?:st|nd|rd|th) level\b/i;

/**
 * The name a table's entry writes a feature by, lowercased: its ordinal ("1st favored enemy"), its bonus ("+1 save
 * bonus against poison") and what follows its name (`ENTRY_SUFFIX`) left out, an alias its feature's.
 */
function entryName(entry: string): string {
  let name = entry
    .toLowerCase()
    .replace(/^\d+(?:st|nd|rd|th) /, "")
    .replace(/^\+\d+ /, "");
  while (ENTRY_SUFFIX.test(name)) name = name.replace(ENTRY_SUFFIX, "");
  return FEATURE_ALIASES[name] ?? name;
}

/** Whether a feature's name is the one an entry's name (`entryName`) names: the same, plural or singular. */
function isNamed(feature: ClassFeature, name: string): boolean {
  const own = feature.name.toLowerCase();
  return own === name || own === `${name}s` || `${own}s` === name;
}

/** The level a feature's text opens on gaining it at, else the first. */
function openingLevel(text: string): number {
  const match = OPENING_LEVEL.exec(text);
  return match ? parseInt(match[1], 10) : 1;
}

/**
 * A class's features, its table's Special column read: each entry is its feature (by its name, plural or singular,
 * or the start of its name: a sorcerer's "bloodline power" is her Bloodline), else a sub-ability its feature's text
 * heads ("Countersong (Su): …", a bard's performances), a feature of its own, its text up to the next heading. A
 * feature no entry names is gained at the level its text opens on, else the first. An entry naming none is unread.
 */
export class ClassFeatures {
  constructor(entry: Pick<ClassEntry, "features">, specials: string[][]) {
    this.features = entry.features
      .filter(({ label }) => !LEFT_OUT_FEATURES.includes(label))
      .map(({ label, text }) => {
        const normalized = normalizeWs(text);
        const name = label.replace(KIND, "");
        return {
          text: normalized,
          subs: [],
          feature: { ability: KIND.test(label), entries: [], levels: [], name, text: normalized },
        };
      });
    for (const [i, entries] of specials.entries()) for (const special of entries) this.place(special, i + 1);
    for (const { feature } of this.features)
      if (feature.levels.length === 0) feature.levels.push(openingLevel(feature.text));
  }

  /** Its features as its page gives them, in its page's order. */
  private readonly features: PageFeature[];
  /** The entries of its table no feature is named by, each with its level. */
  private readonly unplaced: string[] = [];

  /** The feature an entry's name (`entryName`) names: a feature's, a sub-ability's, or one its name starts with. */
  private find(name: string): ClassFeature | undefined {
    const features = this.features.flatMap(({ feature, subs }) => [feature, ...subs]);
    return (
      features.find((feature) => isNamed(feature, name)) ??
      this.subAbility(name) ??
      this.features.find(({ feature }) => name.startsWith(`${feature.name.toLowerCase()} `))?.feature
    );
  }

  /** `entry`, at `level`, made the entries of the feature it names (`find`): unread when it names none. */
  private place(entry: string, level: number) {
    const feature = this.find(entryName(entry));
    if (!feature) {
      this.unplaced.push(`${entry} (level ${level})`);
      return;
    }
    feature.entries.push({ entry, level });
    if (!feature.levels.includes(level)) feature.levels.push(level);
  }

  /**
   * The sub-ability `name` a feature's text heads ("Countersong (Su): …"), made a feature of its own, its text up to
   * the next heading, and its feature's text cut before it: none when no text heads it.
   */
  private subAbility(name: string): ClassFeature | undefined {
    const heading = new RegExp(`(?:^|(?<=[.:;] ))(${RegExp.escape(name)}) \\((?:Ex|Su|Sp)\\): `, "i");
    const page = this.features.find(({ text }) => heading.test(text));
    const match = page && heading.exec(page.text);
    if (!page || !match) return undefined;
    const rest = page.text.slice(match.index + match[0].length);
    const next = HEADING.exec(rest);
    const sub = { ability: true, entries: [], levels: [], name: match[1], text: rest.slice(0, next?.index).trim() };
    page.subs.push(sub);
    const cut = page.text.slice(0, match.index).trim();
    if (cut.length > 0 && cut.length < page.feature.text.length) page.feature.text = cut;
    return sub;
  }

  /** Its features, in its page's order, each sub-ability right after the feature whose text heads it. */
  all(): ClassFeature[] {
    return this.features.flatMap(({ feature, subs }) => [feature, ...subs]);
  }

  /** The entries of its table no feature is named by: "countersong (level 1)". */
  unread(): string[] {
    return this.unplaced;
  }
}
