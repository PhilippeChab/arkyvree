/**
 * The D&D 5th Edition book's references, on core's store (`ReferenceStore`: found, read, written and loaded as every
 * ruleset's parser's are). A reference stores what the scraper read (`raw`) and the corrections made by hand
 * (`overrides`). Loading one derives nothing: the generator's seeds read it (`tools/seeds/`), its overrides applied.
 */

import { join } from "node:path";

import { ReferenceStore } from "@/codegen/core/references/ReferenceStore.ts";
import { stringifyStably } from "@/codegen/core/text/json.ts";
import type { ReferenceByType, ReferenceType, StoredReference } from "@/codegen/dnd5.2/tools/types/reference.ts";

/** The file a book's reference of each type is stored in, in the book's folder (a class's is its own, in `classes/`). */
const REFERENCE_FILE_NAMES: { [T in Exclude<ReferenceType, "class">]: string } = {
  background: "backgrounds.json",
  feat: "feats.json",
  item: "items.json",
  magicItem: "magicItems.json",
  species: "species.json",
  spell: "spells.json",
};

/** The D&D 5th Edition book's references: a folder per book, a JSON file per reference (a class's in `classes/`). */
class References extends ReferenceStore<ReferenceByType> {
  constructor() {
    super(join(import.meta.dirname!, "../../reference"));
  }

  /** A reference as stored, in the shape a reference file has (keys sorted, no undefined values). */
  override resolve<T extends ReferenceType>(_type: T, stored: StoredReference<T>): ReferenceByType[T] {
    return JSON.parse(stringifyStably(stored));
  }

  /** Where `book`'s class reference `name` is stored (`classes/fighter.json`), whether or not it exists. */
  classPath(book: string, name: string): string {
    return join(this.dir, book, "classes", `${name}.json`);
  }

  /** Where `book`'s reference of `type` is stored, whether or not the book has one. */
  path(book: string, type: Exclude<ReferenceType, "class">): string {
    return join(this.dir, book, REFERENCE_FILE_NAMES[type]);
  }
}

export default new References();
