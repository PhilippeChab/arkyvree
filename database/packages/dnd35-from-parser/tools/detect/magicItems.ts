import type { MagicItemReference } from "@/database/packages/dnd35-from-parser/tools/types/magicItems.ts";

import { readBaseItem } from "./readers/items/baseItems.ts";
import { readMagicItemMetadata } from "./readers/items/magicItemMetadata.ts";
import { MagicItemModifiers } from "./readers/modifiers/MagicItemModifiers.ts";

/** A magic item reference's detected section: each item's metadata, its base item and its modifiers. */
export function buildMagicItemDetected(raw: MagicItemReference["raw"]): MagicItemReference["detected"] {
  const detected: MagicItemReference["detected"] = {};

  for (const entry of raw) {
    const description = entry.description ?? "";
    const { modifiers, unresolved } = new MagicItemModifiers(entry.name, description);
    const baseItem = readBaseItem(entry.name, description, entry.category);

    detected[entry.name] = {
      category: entry.category,
      ...readMagicItemMetadata(entry),
      ...(baseItem ? { baseItem } : {}),
      ...(modifiers.length > 0 ? { modifiers } : {}),
      ...(unresolved.length > 0 ? { unresolvedModifiers: unresolved } : {}),
    };
  }

  return detected;
}
