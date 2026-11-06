/** A spell's page of aonprd.com. */

import type { SpellEntry } from "@/codegen/pf1/tools/types/spells.ts";

import { AonPage } from "./AonPage.ts";

/**
 * A spell's page: its stat block (its school and level lines, then its Casting and Effect frames), then its
 * Description frame. Other books' material after them (its mythic version) isn't read (`ownParts`).
 */
export class SpellPage extends AonPage {
  /** `listedName`: the spell as its book lists it (its title, for a page read alone). */
  constructor(
    html: string,
    private readonly listedName?: string,
  ) {
    super(html);
  }

  /** The entry's name: as its book lists it, else its title. */
  private name(): string {
    return this.listedName ?? this.title();
  }

  /** The spell's page as read: none for a page without an entry. */
  read(): SpellEntry | undefined {
    if (!this.title()) return undefined;
    const [title, ...frames] = this.ownParts();
    const description = frames.find((part) => part.heading === "Description");
    const stats = frames.filter((part) => part !== description);
    return {
      name: this.name(),
      sources: this.sources(),
      fields: Object.assign(
        AonPage.fields(AonPage.withoutSource(title.html)),
        ...stats.map((part) => AonPage.fields(part.html)),
      ),
      description: description ? AonPage.textOf(description.html) : "",
    };
  }
}
