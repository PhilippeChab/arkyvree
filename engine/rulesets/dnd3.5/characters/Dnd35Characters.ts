import type { RulesetView } from "@/engine/core/view/index.ts";
import RacePicker from "@/engine/rulesets/dnd3.5/pickers/RacePicker.ts";
import type { Item } from "@/shared/relations.ts";

import CharacterEdits from "./CharacterEdits.ts";
import CharacterCards from "./description/CharacterCards.ts";
import CharacterDescription from "./description/CharacterDescription.ts";
import InventoryEntries from "./inventory/InventoryEntries.ts";
import CharacterSheet from "./sheet/CharacterSheet.tsx";

/**
 * The 3.5 characters, as the module answers the server of them: their sheets, as the API answers them and printed,
 * what equipping an item checks, and the races a new one can pick.
 */
export default class Dnd35Characters {
  /** Refuses languages a character can't speak: not found, or not of its ruleset nor its source chain. */
  checkCharacterLanguages(...args: Parameters<typeof CharacterEdits.checkLanguages>) {
    CharacterEdits.checkLanguages(...args);
  }

  /** A character as a campaign member reads it: partly, or its sheet with its private notes shown or blank. */
  describeCampaignCharacter(...args: Parameters<typeof CharacterDescription.describeForMember>) {
    return CharacterDescription.describeForMember(...args);
  }

  /** A character's sheet as the API answers it, with its bonded creatures', or a creature's. */
  describeCharacter(...args: Parameters<typeof CharacterDescription.describe>) {
    return CharacterDescription.describe(...args);
  }

  /** A character's card, as a list of characters shows it: its race, its classes at their highest level, its total. */
  describeCharacterCard(...args: Parameters<typeof CharacterCards.describe>) {
    return CharacterCards.describe(...args);
  }

  /** A character's printed sheet: the PDF document the server renders. */
  describeCharacterSheet(...args: Parameters<typeof CharacterSheet.describe>) {
    return CharacterSheet.describe(...args);
  }

  /** A character's inventory entries, as its sheet lists them: each with its item, composed by the view. */
  describeInventory<T extends { itemId: string; itemsInRule: Item }>(view: RulesetView, entries: T[]) {
    return InventoryEntries.describe(view, entries);
  }

  /** The race picker of a new character: the races it offers, and whether each is eligible. */
  openRacePicker(view: RulesetView, identity: { alignment?: string; gender?: string }) {
    return RacePicker.open(view, identity);
  }

  /** What a new character stores beside its row: its ability scores; refused when its race isn't a player's. */
  planCharacterCreate(...args: Parameters<typeof CharacterEdits.planCreate>) {
    return CharacterEdits.planCreate(...args);
  }

  /** What an inventory entry's add or edit stores, checked: its placement and charges, the item equipped where asked. */
  planInventoryEntry(...args: Parameters<typeof InventoryEntries.planEntry>) {
    return InventoryEntries.planEntry(...args);
  }
}
