import type { Overrides, ScrapedMeta } from "@/codegen/core/references/types.ts";

import type { LabeledText, Printing } from "./pages.ts";

/** A domain's or a subdomain's page as read. */
export interface DomainEntry {
  /**
   * Its labelled lines, in its page's order: its granted powers and each power, its domain spells… Its deities, proper
   * names that are product identity, are left out.
   */
  details: LabeledText[];
  name: string;
  sources: Printing[];
  /** Whether it's a subdomain, which replaces a power and spells of the domain it's of. */
  subdomain: boolean;
}

/** A book's domains and subdomains. */
export interface DomainReference {
  _meta: ScrapedMeta<"domain">;
  /** Corrections made by hand, by domain, which nothing reads yet. */
  overrides?: Overrides<unknown>;
  raw: DomainEntry[];
}
