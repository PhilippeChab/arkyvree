import { CharacterInputs, type HeldInventoryEntry, type ImportOwner } from "@/engine/core/module/index.ts";
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

  /**
   * A character's card, as a list shows it: its id, name and description, and its chips as its ruleset describes them;
   * a partly seen one's, no description and the chips its ruleset marks as its partial reading's alone.
   */
  describeCard(...args: Args<"describeCard">) {
    return this.module.characters.describeCard(this.view, ...args);
  }

  /** How a new character's scores are set, as its ruleset's form offers it (3.5's abilities, rolled or bought). */
  describeCreation(...args: Args<"describeCreation">) {
    return this.module.characters.describeCreation(this.view, ...args);
  }

  /**
   * A character's inventory entries (each naming its item), as stored, as its sheet lists them: each with its item as
   * the view has it, where it can go and where it's worn.
   */
  describeInventory<T extends HeldInventoryEntry & { itemId: string }>(entries: T[]) {
    return this.module.characters.describeInventory(
      this.view,
      CharacterInputs.resolveEntries(entries, this.view.rulesetData.cow),
    );
  }

  /**
   * The picker of a new character's creation pick (a single link's role: 3.5's race) of what its form says: each
   * entity of a page, with whether it can pick it.
   */
  openCreationPicker(...args: Args<"openCreationPicker">) {
    return this.module.characters.openCreationPicker(this.view, ...args);
  }

  /**
   * What a new character stores: its creation's picks and its scored links' amounts, by the view's ids, refused when a
   * pick is one its rules refuse or one isn't the ruleset's, and its fields' values, refused when one is.
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

  /**
   * The amounts a scored link's edit stores, each by the view's id of its entity: refused when one isn't the ruleset's
   * or is past its bounds.
   */
  planScores(...args: Args<"planScores">) {
    return this.module.characters.planScores(this.view, ...args);
  }

  /** What a new character starts with: its creation's picks and scored links, checked as a create checks them. */
  planStart(...args: Args<"planStart">) {
    return this.module.characters.planStart(this.view, ...args);
  }
}
