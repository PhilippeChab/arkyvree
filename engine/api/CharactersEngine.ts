import type { HeldInventoryEntry, ImportOwner } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

import type { Module, Rest } from "./Modules.ts";

/** What its module answers of the ruleset's characters, past the view the handle binds. */
type Args<K extends keyof Module["characters"]> = Rest<Module["characters"][K], [RulesetView]>;

/** The engine bound to a ruleset's characters, read or new: what needs no character's rows. */
export default class CharactersEngine {
  constructor(
    private readonly view: RulesetView,
    private readonly module: Module,
  ) {}

  /** A character's card, as a list shows it: its race, its classes at their highest level, its total level. */
  describeCard(...args: Args<"describeCard">) {
    return this.module.characters.describeCard(this.view, ...args);
  }

  /** How a new character's ability scores are set: the ways its form offers, their bounds, each score's modifier. */
  describeCreation(...args: Args<"describeCreation">) {
    return this.module.characters.describeCreation(this.view, ...args);
  }

  /**
   * A character's inventory entries (each naming its item), as stored, as its sheet lists them: each with its item as
   * the view has it, where it can go and where it's worn.
   */
  describeInventory<T extends HeldInventoryEntry & { itemId: string }>(entries: T[]) {
    return this.module.characters.describeInventory(this.view, this.view.rulesetData.cow.resolveRows(entries));
  }

  /** The race picker for a new character of what its form says: each race of a page, with whether it can pick it. */
  openRacePicker(...args: Args<"openRacePicker">) {
    return this.module.characters.openRacePicker(this.view, ...args);
  }

  /**
   * The ability scores a character's edit stores, each by the view's id of its ability: refused when one isn't the
   * ruleset's or is past its bounds.
   */
  planAbilities(...args: Args<"planAbilities">) {
    return this.module.characters.planAbilities(this.view, ...args);
  }

  /**
   * What a new character stores: its race and ability scores, by the view's ids, refused when its race isn't a player's
   * or one isn't the ruleset's.
   */
  planCreate(...args: Args<"planCreate">) {
    return this.module.characters.planCreate(this.view, ...args);
  }

  /**
   * What importing the character another program's file holds (`text`) as `owner`'s (its owner, and the id its row is
   * created with) writes, as if leveled up one level at a time, and the report of what it imported and couldn't: by
   * the importer of the ruleset's that reads the file, refused when none does.
   */
  planImport(text: string, owner: ImportOwner) {
    return this.module.imports.planImport(this.view, text, owner);
  }
}
