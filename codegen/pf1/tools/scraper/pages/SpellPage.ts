/** A spell's page of aonprd.com. */

import type { SpellEntry } from "@/codegen/pf1/tools/types/spells.ts";

import { AonPage, type PagePart } from "./AonPage.ts";

/** A name's degree written first ("Mass Heal"), which the site writes after it ("Heal, Mass"). */
const DEGREE_FIRST = /^(greater|lesser|mass) (.+)$/;

/** A name's closing Roman numeral, I to IX ("Summon Monster III"), which the site's listing writes as a digit. */
const ROMAN_NUMERAL = / (i{1,3}|iv|vi{0,3}|ix)$/;

/** The Roman numerals I to IX, each at its value's place. */
const ROMAN_NUMERALS = ["", "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix"];

/**
 * A spell's name as the site's titles and its book's listing both write it: in lower case, its closing Roman numeral a
 * digit ("summon monster 3"), its degree after it ("heal, mass").
 */
function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(ROMAN_NUMERAL, (_, numeral: string) => ` ${ROMAN_NUMERALS.indexOf(numeral)}`)
    .replace(DEGREE_FIRST, "$2, $1");
}

/**
 * A spell's page: its stat block (its school and level lines, then its Casting and Effect frames), then its
 * Description frame. Other books' material after them (its mythic version) isn't read (`AonPage.entries`). A page that
 * prints several spells (Summon Monster I to IX, Heal and Mass Heal) reads the one its book lists, by its title.
 */
export class SpellPage extends AonPage {
  /** `listedName`: the spell as its book lists it (its title, for a page read alone). */
  constructor(
    html: string,
    private readonly listedName?: string,
  ) {
    super(html);
  }

  /**
   * The spell's own parts: those of the entry titled as its book lists it (`nameKey`), else the page's only one; none
   * when the page prints several and none is the listed spell, or none at all.
   */
  private listedParts(): PagePart[] | undefined {
    const entries = this.entries();
    if (!this.listedName || entries.length <= 1) return entries[0];
    const listed = nameKey(this.listedName);
    return entries.find(([title]) => nameKey(title.heading) === listed);
  }

  /** The spell's page as read: none for a page without its entry. */
  read(): SpellEntry | undefined {
    const parts = this.listedParts();
    if (!parts) return undefined;
    const [title, ...frames] = parts;
    const description = frames.find((part) => part.heading === "Description");
    const stats = frames.filter((part) => part !== description);
    return {
      name: this.listedName ?? title.heading,
      sources: AonPage.sourcesOf(title.html),
      fields: Object.assign(
        AonPage.fields(AonPage.withoutSource(title.html)),
        ...stats.map((part) => AonPage.fields(part.html)),
      ),
      description: description ? AonPage.textOf(description.html) : "",
    };
  }
}
