import { CharacterInputs } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/types.ts";
import type { CharacterLevel, Item } from "@/shared/relations.ts";

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
  checkLanguages(...args: Args<"checkCharacterLanguages">) {
    this.module.characters.checkCharacterLanguages(this.view, ...args);
  }

  /** A character's card, as a list shows it: its race, its classes at their highest level, its total level. */
  describeCard(...args: Args<"describeCharacterCard">) {
    return this.module.characters.describeCharacterCard(this.view, ...args);
  }

  /** A character's inventory entries (each with the item row it names), as stored, as its sheet lists them. */
  describeInventory<T extends { itemId: string; itemsInRule: Item }>(entries: T[]) {
    return this.module.characters.describeInventory(this.view, this.view.rulesetData.cow.resolveRows(entries));
  }

  /** A saved level's selections, as its edit opens them: the level and its picks as stored, read as the view reads them. */
  describeLevel(
    level: CharacterLevel,
    picks: Rest<Module["levelUp"]["describeLevel"], [RulesetView, CharacterLevel]>[0],
  ) {
    const { cow } = this.view.rulesetData;
    const [resolved] = cow.resolveRows([level]);
    return this.module.levelUp.describeLevel(this.view, resolved, CharacterInputs.resolvePicks(picks, cow));
  }

  /** The race picker for a new character of what its form says: each race of a page, with whether it can pick it. */
  openRacePicker(...args: Args<"openRacePicker">) {
    return this.module.characters.openRacePicker(this.view, ...args);
  }

  /** What a new character stores beside its row: its ability scores, refused when its race isn't a player's. */
  planCreate(...args: Args<"planCharacterCreate">) {
    return this.module.characters.planCharacterCreate(this.view, ...args);
  }
}
