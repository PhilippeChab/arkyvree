/** The D&D 5th Edition parser's references, as its tests read them: the book's items, corrected, and a class's levels. */

import References from "@/codegen/dnd5/tools/references/References.ts";
import type { ClassLevel } from "@/codegen/dnd5/tools/types/classes.ts";
import type { ItemEntry } from "@/codegen/dnd5/tools/types/items.ts";
import { CORE_BOOK } from "@/vocabulary/dnd5/books.ts";

/** What `pattern` reads off an item's equipment categories ("Martial Melee Weapons": Martial), if any names it. */
export function readCategory(item: ItemEntry, pattern: RegExp): string | undefined {
  return item.equipment_categories.map((category) => pattern.exec(category.name)?.[1]).find(Boolean);
}

/** A class's own levels (`name`, its file's: "wizard"), as its reference reads them. */
export function readClassLevels(name: string): ClassLevel[] {
  return References.load(References.classPath(CORE_BOOK, name), "class").raw.levels;
}

/** An item's cost in gold pieces: a silver piece is 0.1, a copper piece 0.01. */
export function readCostInGold(item: ItemEntry): number {
  const perGold: Record<string, number> = { cp: 100, sp: 10, gp: 1 };
  return Math.round((item.cost.quantity / perGold[item.cost.unit]) * 100) / 100;
}

/** The book's equipment, each item with its overrides in place of the database's fields. */
export function readItems(): ItemEntry[] {
  const { overrides, raw } = References.load(References.path(CORE_BOOK, "item"), "item");
  return raw.map((item) => ({ ...item, ...overrides?.[item.name] }));
}
