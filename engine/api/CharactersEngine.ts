import type { HeldInventoryEntry } from "@/engine/core/module/index.ts";
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

  /** Refuses languages a character can't speak: not found among the rows read, or not of its ruleset nor its chain. */
  checkLanguages(...args: Args<"checkLanguages">) {
    this.module.characters.checkLanguages(this.view, ...args);
  }

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

  /** The ability scores a character's edit stores, refused when one isn't the ruleset's or is past its bounds. */
  planAbilities(...args: Args<"planAbilities">) {
    return this.module.characters.planAbilities(this.view, ...args);
  }

  /** What a new character stores beside its row: its ability scores, refused when its race isn't a player's. */
  planCreate(...args: Args<"planCreate">) {
    return this.module.characters.planCreate(this.view, ...args);
  }
}
