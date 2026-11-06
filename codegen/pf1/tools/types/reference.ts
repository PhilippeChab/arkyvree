/** The Pathfinder 1 references by type. */

import type { Stored } from "@/codegen/core/references/types.ts";

import type { ClassReference } from "./classes.ts";
import type { DomainReference } from "./domains.ts";
import type { FeatReference } from "./feats.ts";
import type { ItemReference } from "./items.ts";
import type { MagicItemReference } from "./magicItems.ts";
import type { RaceReference } from "./races.ts";
import type { SpellReference } from "./spells.ts";

/** Each type of reference, by its name in a reference's `_meta`. */
export interface ReferenceByType {
  class: ClassReference;
  domain: DomainReference;
  feat: FeatReference;
  item: ItemReference;
  magicItem: MagicItemReference;
  race: RaceReference;
  spell: SpellReference;
}

/** A type of reference, as a reference's `_meta` names it. */
export type ReferenceType = keyof ReferenceByType;

/** A reference as it's stored: what the scraper read, and the corrections made by hand. */
export type StoredReference<T extends ReferenceType = ReferenceType> = Stored<ReferenceByType[T]>;
