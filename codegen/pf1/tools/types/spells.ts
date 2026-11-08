import type { Overrides, ScrapedMeta } from "@/codegen/core/references/types.ts";

import type { Printing } from "./pages.ts";

/** A spell's page as read. */
export interface SpellEntry {
  description: string;
  /** Its stat block by label, as its page writes each: "School", "Level", "Casting Time", "Components", "Range"… */
  fields: Record<string, string>;
  name: string;
  sources: Printing[];
}

/** A book's spells. */
export interface SpellReference {
  _meta: ScrapedMeta<"spell">;
  /** Corrections made by hand, by spell, which its seeds read (`SpellSeeds`). */
  overrides?: Overrides<unknown>;
  raw: SpellEntry[];
}
