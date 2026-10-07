import type { CowFeatEntry, CowSpellEntry } from "@/database/packages/dnd35/content/rulesets/types.ts";
import { include } from "@/server/mixins.ts";

import { collectAptitudes } from "./aptitudes.ts";
import { BaseBookSeeds } from "./BaseBookSeeds.ts";
import { Classes } from "./concerns/Classes.ts";
import { Domains } from "./concerns/Domains.ts";
import { Feats } from "./concerns/Feats.ts";
import { Items } from "./concerns/Items.ts";
import { MagicItems } from "./concerns/MagicItems.ts";
import { Races } from "./concerns/Races.ts";
import { Spells } from "./concerns/Spells.ts";
import { WizardSchools } from "./concerns/WizardSchools.ts";
import { buildCowFeats, buildCowSpells } from "./copies.ts";

/**
 * A book's seeds, each kind built once from its references (`<kind>Seeds()`), with what the book's seeds of every kind
 * look up (`BaseBookSeeds`): a kind is a concern (`concerns/`), and what's made of several kinds is its own: the
 * aptitudes its seeds use, what it copies from the core rules.
 */
export class BookSeeds extends include(
  BaseBookSeeds,
  Classes,
  Domains,
  Feats,
  Items,
  MagicItems,
  Races,
  Spells,
  WizardSchools,
) {
  /** The aptitudes the book's seeds use (`collectAptitudes`). */
  aptitudes(): string[] {
    return this.memo("aptitudes", () => collectAptitudes(this));
  }

  /** The core feats the book copies (`buildCowFeats`). */
  cowFeats(): CowFeatEntry[] {
    return this.memo("cowFeats", () => buildCowFeats(this));
  }

  /** The core spells the book copies (`buildCowSpells`). */
  cowSpells(): CowSpellEntry[] {
    return this.memo("cowSpells", () => buildCowSpells(this));
  }
}
