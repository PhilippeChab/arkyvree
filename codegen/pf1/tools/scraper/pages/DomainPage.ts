/** A domain's page of aonprd.com, which holds its subdomains too. */

import type { DomainEntry } from "@/codegen/pf1/tools/types/domains.ts";
import type { LabeledText } from "@/codegen/pf1/tools/types/pages.ts";

import { AonPage } from "./AonPage.ts";

/**
 * A domain's page: its labelled lines under its title (its deities, left out, their names product identity; its granted
 * powers and each power, in italics; its domain spells), then a section per subdomain of it ("Cloud Subdomain"), each with its own Source line and labelled
 * lines (its associated domains and deities, its replacement power and spells).
 */
export class DomainPage extends AonPage {
  /** A domain's lines but its deities' ("Deities", "Associated Deities"): their names are product identity. */
  private static withoutDeities(details: LabeledText[]): LabeledText[] {
    return details.filter(({ label }) => !label.endsWith("Deities"));
  }

  /** The domain, as its page has it: none for a page without an entry. */
  readDomain(name: string): DomainEntry | undefined {
    if (!this.title()) return undefined;
    return {
      name,
      subdomain: false,
      sources: this.sources(),
      details: DomainPage.withoutDeities(AonPage.labeled(this.titlePart(), true).entries),
    };
  }

  /** The subdomain `name`, as its section of the page has it: none when the page has no section of it. */
  readSubdomain(name: string): DomainEntry | undefined {
    const section = this.parts().find((part) => part.level === 2 && part.heading === `${name} Subdomain`);
    if (!section) return undefined;
    return {
      name,
      subdomain: true,
      sources: AonPage.sourcesOf(section.html),
      details: DomainPage.withoutDeities(AonPage.labeled(AonPage.withoutSource(section.html), true).entries),
    };
  }
}
