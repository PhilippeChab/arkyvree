import { CharactersPart } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { Dnd35Descriptions } from "@/engine/rulesets/dnd3.5/descriptions.ts";
import RacePicker from "@/engine/rulesets/dnd3.5/pickers/RacePicker.ts";

import CharacterEdits from "./CharacterEdits.ts";
import CharacterDescription from "./description/CharacterDescription.ts";
import InventoryEntries from "./inventory/InventoryEntries.ts";
import CharacterSheet from "./sheet/CharacterSheet.tsx";

/**
 * The 3.5 characters, as the module answers the server of them: their sheets, as the API answers them and printed,
 * where an item goes and what equipping one checks, and how a new one's ability scores are set and the races it can
 * pick.
 */
export default class Dnd35Characters extends CharactersPart<Dnd35Descriptions> {
  /** An inventory entry beside its row: where its item can go, and where it's worn. */
  protected describeInventoryEntry(...args: Parameters<typeof InventoryEntries.describeInventoryEntry>) {
    return InventoryEntries.describeInventoryEntry(...args);
  }

  /** A character's sheet as the API answers it, with its bonded creatures', or a creature's. */
  describe(...args: Parameters<typeof CharacterDescription.describe>) {
    return CharacterDescription.describe(...args);
  }

  /** How a new character's ability scores are set: the SRD's methods, the scores' bounds, each score's modifier. */
  describeCreation(...args: Parameters<typeof CharacterEdits.describeCreation>) {
    return CharacterEdits.describeCreation(...args);
  }

  /** A character as a campaign member reads it: partly, or its sheet with its private notes shown or blank. */
  describeForMember(...args: Parameters<typeof CharacterDescription.describeForMember>) {
    return CharacterDescription.describeForMember(...args);
  }

  /** Why a location can't take one more item of the character's, if it can't: what the inventory dialogs warn of. */
  describePlacement(...args: Parameters<typeof InventoryEntries.describePlacement>) {
    return InventoryEntries.describePlacement(...args);
  }

  /** A character's printed sheet: the PDF document the server renders. */
  describeSheet(...args: Parameters<typeof CharacterSheet.describeSheet>) {
    return CharacterSheet.describeSheet(...args);
  }

  /** The race picker of a new character: the races it offers, and whether each is eligible. */
  openRacePicker(view: RulesetView, identity: { alignment?: string; gender?: string }) {
    return new RacePicker(view, identity);
  }

  /** The ability scores a character's edit stores: refused when one isn't the ruleset's, or past the rules' bounds. */
  planAbilities(...args: Parameters<typeof CharacterEdits.planAbilities>) {
    return CharacterEdits.planAbilities(...args);
  }

  /** What a new character stores beside its row: its ability scores; refused when its race isn't a player's. */
  planCreate(...args: Parameters<typeof CharacterEdits.planCreate>) {
    return CharacterEdits.planCreate(...args);
  }

  /** What an inventory entry's add or edit stores, checked: its placement and charges, the item equipped where asked. */
  planInventoryEntry(...args: Parameters<typeof InventoryEntries.planInventoryEntry>) {
    return InventoryEntries.planInventoryEntry(...args);
  }
}
