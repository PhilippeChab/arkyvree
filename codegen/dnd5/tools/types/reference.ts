/** The D&D 5th Edition references by type, and where each was read from. */

import type { Stored } from "@/codegen/core/references/types.ts";

import type { BackgroundReference } from "./backgrounds.ts";
import type { ClassReference } from "./classes.ts";
import type { FeatReference } from "./feats.ts";
import type { ItemReference } from "./items.ts";
import type { MagicItemReference } from "./magicItems.ts";
import type { SpeciesReference } from "./species.ts";
import type { SpellReference } from "./spells.ts";

/** Each type of reference, by its name in a reference's `_meta`. */
export interface ReferenceByType {
  background: BackgroundReference;
  class: ClassReference;
  feat: FeatReference;
  item: ItemReference;
  magicItem: MagicItemReference;
  species: SpeciesReference;
  spell: SpellReference;
}

/**
 * Where and when a reference was read: the database's files it was read from (`sourceUrls`, by the file's name:
 * "Classes", "Levels"), at one commit of the database's repository.
 */
export interface ScrapedFrom<T extends ReferenceType> {
  book: string;
  scrapedAt: string;
  sourceUrls: Record<string, string>;
  type: T;
}

/** A type of reference, as a reference's `_meta` names it. */
export type ReferenceType = keyof ReferenceByType;

/** A reference as it's stored: what the scraper read, and the corrections made by hand. */
export type StoredReference<T extends ReferenceType = ReferenceType> = Stored<ReferenceByType[T]>;
