import type { ModifierEffect } from "@/content/core/builders/customization/types.ts";
import { classSpells, CLERIC_DOMAIN, DOMAIN_SPELLS } from "@/content/pf1/builders/aptitudes/names.ts";
import type { ClassSeed } from "@/content/pf1/builders/classes/types.ts";
import type { DomainSeed } from "@/content/pf1/builders/domains/types.ts";
import type { FeatSeed } from "@/content/pf1/builders/feats/types.ts";
import type { Pf1ItemSeed } from "@/content/pf1/builders/items/types.ts";
import type { RaceSeed } from "@/content/pf1/builders/races/types.ts";
import type { LeveledSpellSeed } from "@/content/pf1/builders/spells/types.ts";
import { stripSeparators } from "@/shared/text.ts";
import { BONDED_KINDS } from "@/vocabulary/pf1/bondedKinds.ts";

/** What a book's seeds are, of every kind that names an aptitude, as the generator writes them. */
export interface BookContents {
  classes: ClassSeed[];
  domains: DomainSeed[];
  feats: FeatSeed[];
  items: Pf1ItemSeed[];
  races: RaceSeed[];
  spells: LeveledSpellSeed[];
}

/** A target's aptitude, by its slug (`aptitudes.<slug>.allowed`, a spell level's `aptitudes.<slug>.<level>.uses`). */
const APTITUDE_TARGET = /^aptitudes\.([^.]+)\./;

/**
 * The slugs of the bonded creatures' aptitudes (a familiar's "Familiar Bond", its "Familiar Class Feature"…), which a
 * class's modifier may target: no book's, their bond's (`content/pf1/data/bonds/`, seeded with it), named after its
 * class (`BONDED_KINDS`).
 */
const BOND_SLUGS = new Set(
  BONDED_KINDS.flatMap(({ className }) => [`${className} Bond`, `${className} Class Feature`]).map((name) =>
    stripSeparators(name),
  ),
);

/** The aptitude every feat a level up picks is taken in. */
export const GENERAL = "General";

/**
 * A book's aptitudes (`names`): "General", every aptitude its seeds name (its feats', its spells' and their levels',
 * its classes' features', free feats' and spell lists'; with domains, the cleric's domain pick and its domain spells'
 * slots), and every aptitude a target names by its slug (a modifier's, a class's aptitude pick's), by the name that
 * slug is of: a slug of no name refuses the book.
 */
export class BookAptitudes {
  constructor(private readonly contents: BookContents) {}

  /** The aptitudes its seeds name. */
  private named(): Set<string> {
    const { classes, domains, feats, spells } = this.contents;
    const names = new Set([GENERAL]);
    const add = (...aptitudes: (string | undefined)[]) => {
      for (const aptitude of aptitudes) if (aptitude) names.add(aptitude);
    };
    for (const feat of feats) add(...feat.aptitudes);
    for (const spell of spells) add(...spell.aptitudes, ...Object.keys(spell.aptitudeLevels ?? {}));
    for (const seed of classes) {
      add(seed.classFeatureAptitude, ...(seed.freeFeats ?? []).map(([, , aptitude]) => aptitude));
      if (seed.spells) add(classSpells(seed.name));
    }
    if (domains.length > 0) add(CLERIC_DOMAIN, DOMAIN_SPELLS);
    return names;
  }

  /** Every target its seeds name: their modifiers', their classes' aptitude picks'. */
  private targets(): string[] {
    const { classes, domains, feats, items, races } = this.contents;
    const modifiers: { modifiers?: ModifierEffect[] }[] = [...classes, ...domains, ...feats, ...items, ...races];
    return [
      ...modifiers.flatMap((seed) => (seed.modifiers ?? []).map(({ target }) => target)),
      ...classes.flatMap((seed) => (seed.aptitudePicks ?? []).map(({ target }) => target)),
    ];
  }

  /** Its aptitudes, sorted: a target's slug that's no aptitude's, the book's or a bonded creature's, throws. */
  names(): string[] {
    const names = this.named();
    const bySlug = new Map([...names].map((name) => [stripSeparators(name), name]));
    for (const target of this.targets()) {
      const slug = target.match(APTITUDE_TARGET)?.[1];
      if (slug && !bySlug.has(slug) && !BOND_SLUGS.has(slug))
        throw new Error(`${target}: no aptitude of the book is "${slug}"`);
    }
    return [...names].sort();
  }
}
