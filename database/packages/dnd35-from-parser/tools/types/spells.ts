import type { Overrides, ScrapedMeta } from "./reference.ts";

export type SpellReference = {
  _meta: ScrapedMeta<"spell">;

  /** All spells scraped from the detail page */
  raw: {
    name: string;
    /** Anchor ID from the SRD page (e.g. "obscuring-mist") — used to cross-reference domain spell lists */
    slug: string;
    school: string;
    subschool?: string;
    descriptors: string[];
    /** Level entries as scraped, e.g. "Sor/Wiz 3", "Clr 2" */
    levelEntries: { className: string; level: number }[];
    components: string[];
    castingTime: string;
    range: string;
    target?: string;
    effect?: string;
    area?: string;
    duration: string;
    savingThrow: string;
    spellResistance: string;
    description: string;
  }[];

  overrides?: Overrides<{
    description?: string;
    /** Extra class/level entries missing from scraped data */
    levelEntries?: { className: string; level: number }[];
  }>;
};
