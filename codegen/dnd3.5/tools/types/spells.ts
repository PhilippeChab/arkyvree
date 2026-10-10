import type { Property } from "@/content/core/builders/customization/types.ts";

import type { Overrides, ScrapedMeta } from "./reference.ts";

export interface SpellReference {
  _meta: ScrapedMeta<"spell">;

  /**
   * What each spell's text gives: its properties and its saving throw, normalized, its base spell's where it lacks some
   */
  detected: Record<string, { properties: Property[]; savingThrow: string }>;

  /**
   * Each spell as the seeds make it, its overrides applied: its description, and its level entries, the scraped ones
   * and the overrides' (which only the copies an extension makes of a core spell read so far: #359)
   */
  mapping: Record<string, { description: string; levelEntries: { className: string; level: number }[] }>;

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
    /** Level entries as scraped, a class's or a domain's name and the level it gives: "Wizard 6", "Fire 4" */
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
}
