/** An item's page of aonprd.com, mundane or magic. */

import type { LabeledText, Printing } from "@/codegen/pf1/tools/types/pages.ts";

import { AonPage } from "./AonPage.ts";

/** An item's page as read, whatever its kind. */
export interface ItemReading {
  /** Its construction by label: "Requirements", "Cost". None for an item made otherwise. */
  construction: Record<string, string>;
  description: string;
  /** Its stat block by label: a weapon's "Damage", an armor's "Armor Bonus", a magic item's "Aura", "Slot", "Price"… */
  fields: Record<string, string>;
  name: string;
  /**
   * Its page's other sections, each under its heading: an artifact's Destruction, a Ring of Elemental Command's Air,
   * Earth, Fire and Water. None for most, and none a later book adds (`LATER_SECTIONS`).
   */
  sections: LabeledText[];
  sources: Printing[];
}

/** The frames an item's page reads apart: its stat block's, its description's and its construction's. */
const ITEM_FRAMES = ["Statistics", "Description", "Construction"];

/**
 * The sections later books add to an item, which the site prints without a Source line of their own: an ioun stone's
 * Resonance (Occult Adventures), a good's Alchemical Recipe (the Alchemy Manual). They aren't the item's book's.
 */
const LATER_SECTIONS = ["Alchemical Recipe", "Resonance"];

/**
 * An item's page: its stat block (under its title, a magic item's or a good's; in a Statistics frame, a weapon's or an
 * armor's), its Description frame, a magic item's Construction frame, and its other sections, each kept under its
 * heading. Other books' material after them (another book's version) isn't read (`ownParts`). Its name is its title's: a book lists an item of several bonuses once per bonus ("Cloak of
 * Resistance (+1)"), all on its one page.
 */
export class ItemPage extends AonPage {
  /** The item's page as read: none for a page without an entry. */
  read(): ItemReading | undefined {
    if (!this.title()) return undefined;
    const [title, ...frames] = this.ownParts();
    const frame = (heading: string) => frames.find((part) => part.heading === heading)?.html;
    const description = frame("Description");
    const sections = frames.filter(
      ({ heading }) => !ITEM_FRAMES.includes(heading) && !LATER_SECTIONS.includes(heading),
    );
    const construction = frame("Construction");
    return {
      name: this.title(),
      sources: this.sources(),
      fields: { ...AonPage.fields(AonPage.withoutSource(title.html)), ...AonPage.fields(frame("Statistics") ?? "") },
      description: description ? AonPage.textOf(description) : "",
      sections: sections.map(({ heading, html }) => ({ label: heading, text: AonPage.textOf(html) })),
      construction: construction ? AonPage.fields(construction) : {},
    };
  }
}
