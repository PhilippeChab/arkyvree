import type { Modifier } from "@/content/dnd3.5/builders/customization/types.ts";

import type { DetectedModifiers, Overrides, ScrapedMeta } from "./reference.ts";

/** A domain's pool of feats (e.g. War Domain Weapon: a feat per martial weapon). */
type DomainFeatPool = {
  aptitude: string;
  description?: string;
  grants: string[];
  items: "martial" | "simple" | "exotic" | "all" | string[];
  namePrefix: string;
};

/** A domain version of the domain index (dnd.arkalseif.info): its page's slug ("celerity-cd") and its label ("Celerity (CD)"). */
export type DomainIndexEntry = { label: string; slug: string };

export type DomainReference = {
  _meta: ScrapedMeta<"domain">;

  detected: Record<string, DetectedModifiers>;

  /** Each domain as the seeds make it: its overrides applied */
  mapping: Record<
    string,
    {
      description?: string;
      featPool?: DomainFeatPool;
      modifiers?: Modifier[];
      name: string;
      spells: { level: number; name: string }[];
    }
  >;

  overrides?: Overrides<{
    description?: string;
    featPool?: DomainFeatPool;
    modifiers?: Modifier[];
    name?: string;
    spells?: { level: number; name: string }[];
  }>;

  /** The book's domains as it prints them: its version of each, the page it's on, its granted power, its spells. */
  raw: {
    description: string;
    name: string;
    page?: number;
    spells: { level: number; name: string }[];
  }[];
};

/**
 * A domain version, as its page gives it: its label, its book (the rulebook's slug, "complete-divine--56") and page,
 * its granted power, its spells.
 */
export type DomainVersion = {
  bookSlug?: string;
  description: string;
  label: string;
  page?: number;
  spells: DomainVersionSpell[];
};

/** A spell a domain version's page lists: its page (`<book>/<spell>`), its name and its edition ("Core (3.5)"). */
export type DomainVersionSpell = { edition: string; name: string; path: string };
