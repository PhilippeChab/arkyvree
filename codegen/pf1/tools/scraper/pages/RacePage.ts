/** A race's page of aonprd.com. */

import type { RaceEntry } from "@/codegen/pf1/tools/types/races.ts";

import { AonPage } from "./AonPage.ts";

/**
 * A race's page: its description and its labelled paragraphs (its physical description, its society…) under its title,
 * which aren't open game content and aren't read, then its racial traits under a heading of their own ("Dwarf Racial
 * Traits"). The other books' material after them
 * (its subraces, its alternate racial traits, its favored class options) isn't read.
 */
export class RacePage extends AonPage {
  /** `listedName`: the race as its book lists it ("Dwarf", though its page's title is "Dwarves"; its title, for a page read alone). */
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

  /** The race's page as read: none for a page without an entry. */
  read(): RaceEntry | undefined {
    if (!this.title()) return undefined;
    const traits = this.parts().find(
      (part) => part.heading.endsWith(" Racial Traits") && !/Alternate/.test(part.heading),
    );
    return {
      name: this.name(),
      sources: this.sources(),
      traits: traits ? AonPage.labeled(traits.html).entries : [],
    };
  }
}
