import { sanitizeJsonValues } from "@/database/packages/dnd35-from-parser/tools/text/sanitize.ts";
import type { MagicItemReference } from "@/database/packages/dnd35-from-parser/tools/types/magicItems.ts";

import { readBaseItem } from "./readers/items/baseItems.ts";
import { readMagicItemMetadata } from "./readers/items/magicItemMetadata.ts";
import { MagicItemModifiers } from "./readers/modifiers/MagicItemModifiers.ts";

/** A magic item reference's detector: each item's metadata, its base item and its modifiers (`detected`). */
export class MagicItemDetector {
  constructor(stored: Pick<MagicItemReference, "_meta" | "overrides" | "raw">) {
    this.stored = stored;
  }

  /** The reference as stored. */
  private readonly stored: Pick<MagicItemReference, "_meta" | "overrides" | "raw">;

  /** Each item's detected section: its metadata, its base item, its modifiers. */
  detected(): MagicItemReference["detected"] {
    const detected: MagicItemReference["detected"] = {};

    for (const entry of this.stored.raw) {
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

  /** The reference with what's derived from it: its detected section. */
  resolve(): MagicItemReference {
    const { _meta, overrides, raw } = this.stored;
    return { _meta, raw, ...sanitizeJsonValues({ overrides, detected: this.detected() }) };
  }
}
