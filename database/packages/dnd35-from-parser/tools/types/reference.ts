/** What every reference holds (its scraped `_meta`, its overrides, the texts it names), and the references by type. */

import type { Modifier } from "@/database/packages/dnd35/content/customization/types.ts";

import type { ClassReference } from "./classes.ts";
import type { DomainReference } from "./domains.ts";
import type { FeatReference } from "./feats.ts";
import type { ItemReference } from "./items.ts";
import type { MagicItemReference } from "./magicItems.ts";
import type { RaceReference } from "./races.ts";
import type { SpellReference } from "./spells.ts";
import type { WizardSchoolReference } from "./wizardSchools.ts";

/** A reference's text checked against the fixed set the seed accepts: the option it is, or why it isn't one. */
export type Checked<T> = { ok: true; value: T } | { ok: false; problem: string };

/**
 * A domain's or a race's detected modifiers, the invalid paths (bugs to fix) and the text that couldn't be parsed (to
 * review). Their modifiers have no requirements: only a feat's has.
 */
export type DetectedModifiers = { errors?: string[]; modifiers: Modifier[]; unresolvedModifiers?: string[] };

/** A named piece of text: a race's trait, a class feature's sub-option. */
export type NamedText = { description: string; name: string };

/**
 * A reference's overrides (corrections made by hand, stored in its file and kept across re-scrapes) by entry name,
 * and the entries reviewed (no further action needed).
 */
export type Overrides<T> = Record<string, T> & { reviewed?: string[] };

/** Each type of reference, by its name in a reference's `_meta`. */
export type ReferenceByType = {
  class: ClassReference;
  domain: DomainReference;
  feat: FeatReference;
  item: ItemReference;
  magicItem: MagicItemReference;
  race: RaceReference;
  spell: SpellReference;
  wizardSchool: WizardSchoolReference;
};

/** A reference file: where it is, and the type, page and book its `_meta` names. */
export type ReferenceFile = { book: string; path: string; type: ReferenceType; url?: string };

/** What a command selects reference files by (`CommandLine.filters`): a book, a type, a name (its file's, lowercased). */
export type ReferenceFilters = { bookFilter?: string; nameFilter?: string; typeFilter?: string };

/** A type of reference, as a reference's `_meta` names it. */
export type ReferenceType = keyof ReferenceByType;

/** Where and when a reference was scraped. */
export type ScrapedMeta<T extends string> = { book: string; scrapedAt: string; sourceUrl: string; type: T };

/** A reference as it's stored: what the scraper read, and the corrections made by hand. */
export type StoredReference<T extends ReferenceType = ReferenceType> = Pick<
  ReferenceByType[T],
  "_meta" | "raw" | "overrides"
>;
