import type { Modifier } from "@/database/packages/dnd35/content/customization/types.ts";

import type { DetectedModifiers, Overrides, ScrapedMeta } from "./reference.ts";

/** A domain's pool of feats (e.g. War Domain Weapon: a feat per martial weapon). */
type DomainFeatPool = {
  aptitude: string;
  namePrefix: string;
  items: "martial" | "simple" | "exotic" | "all" | string[];
  grants: string[];
  description?: string;
};

export type DomainReference = {
  _meta: ScrapedMeta<"domain">;

  /** The book's domains as it prints them: its version of each, the page it's on, its granted power, its spells. */
  raw: {
    name: string;
    page?: number;
    description: string;
    spells: { name: string; level: number }[];
  }[];

  detected: Record<string, DetectedModifiers>;

  overrides?: Overrides<{
    name?: string;
    description?: string;
    modifiers?: Modifier[];
    spells?: { name: string; level: number }[];
    featPool?: DomainFeatPool;
  }>;

  mapping: Record<
    string,
    {
      description?: string;
      modifiers?: Modifier[];
      featPool?: DomainFeatPool;
    }
  >;
};
