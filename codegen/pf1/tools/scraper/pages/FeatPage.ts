/** A feat's page of aonprd.com. */

import type { FeatEntry } from "@/codegen/pf1/tools/types/feats.ts";

import { AonPage } from "./AonPage.ts";

/**
 * A feat's page: its title (its name and its types: "Power Attack (Combat)"), its opening line (not read: it isn't open
 * game content), then its labelled sections (its Prerequisites, Benefit, Normal, Special…). What follows its first heading (its combat trick, its mythic
 * version: other books') isn't read.
 */
export class FeatPage extends AonPage {
  /** `listedName`: the feat as its book lists it, which its title follows with its types (its title, for a page read alone). */
  constructor(
    html: string,
    private readonly listedName?: string,
  ) {
    super(html);
  }

  /** The entry's name: as its book lists it, else its title without its types. */
  private name(): string {
    return this.listedName ?? this.title().replace(/\s*\([^)]*\)$/, "");
  }

  /** The feat's types, as its title gives them after its name: none for a general feat. */
  private types(): string[] {
    const title = this.title();
    const types = title.startsWith(this.name())
      ? /^\s*\((.+)\)\s*$/.exec(title.slice(this.name().length))?.[1]
      : undefined;
    return types ? types.split(/\s*,\s*/) : [];
  }

  /** The feat's page as read: none for a page without an entry. */
  read(): FeatEntry | undefined {
    if (!this.title()) return undefined;
    const sections = AonPage.labeled(this.titlePart()).entries;
    return { name: this.name(), types: this.types(), sources: this.sources(), sections };
  }
}
