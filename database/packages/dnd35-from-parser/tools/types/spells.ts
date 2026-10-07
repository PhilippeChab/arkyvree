import type { Property } from "@/database/packages/dnd35/content/customization/types.ts";

import type { Overrides, ScrapedMeta } from "./reference.ts";

export type SpellReference = {
  _meta: ScrapedMeta<"spell">;

  /** What each spell's text gives: its properties and its saving throw, normalized, its base spell's where it lacks some */
  detected: Record<string, { properties: Property[]; savingThrow: string }>;

  overrides?: Overrides<{
    description?: string;
    /** Extra class/level entries missing from scraped data */
    levelEntries?: { className: string; level: number }[];
  }>;

  /** All spells scraped from the detail page */
  raw: {
    area?: string;
    castingTime: string;
    components: string[];
    description: string;
    descriptors: string[];
    duration: string;
    effect?: string;
    /** Level entries as scraped, e.g. "Sor/Wiz 3", "Clr 2" */
    levelEntries: { className: string; level: number }[];
    name: string;
    range: string;
    savingThrow: string;
    school: string;
    /** Anchor ID from the SRD page (e.g. "obscuring-mist") — used to cross-reference domain spell lists */
    slug: string;
    spellResistance: string;
    subschool?: string;
    target?: string;
  }[];
};
