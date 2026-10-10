import { CharactersPart, type RacePickQuery } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { Dnd35Descriptions } from "@/engine/rulesets/dnd3.5/descriptions.ts";
import RacePicker from "@/engine/rulesets/dnd3.5/pickers/RacePicker.ts";

import CharacterDescription from "./description/CharacterDescription.ts";
import InventoryEntries from "./inventory/InventoryEntries.ts";
import NewCharacters from "./NewCharacters.ts";
import CharacterSheet from "./sheet/CharacterSheet.tsx";

/**
 * The 3.5 characters, as the module answers the server of them: their sheets, as the API answers them, as a member who
 * reads one partly reads it, and printed; where an item goes and what equipping one checks, and how a new one's ability
 * scores are set and the races it can pick. The characters part reads the private notes as the viewer does, and checks
 * an item's ruleset and charges and the scores' bounds.
 */
export default class Dnd35Characters extends CharactersPart<Dnd35Descriptions> {
  /** A character's sheet as the API answers it, with its bonded creatures', or a creature's. */
  protected override describeFull(...args: Parameters<typeof CharacterDescription.describeFull>) {
    return CharacterDescription.describeFull(...args);
  }

  /** An inventory entry beside its row: where its item can go, and where it's worn. */
  protected override describeInventoryEntry(...args: Parameters<typeof InventoryEntries.describeInventoryEntry>) {
    return InventoryEntries.describeInventoryEntry(...args);
  }

  /** A character as a campaign member who reads it partly reads it: who it is and what it looks like. */
  protected override describePartial(...args: Parameters<typeof CharacterDescription.describePartial>) {
    return CharacterDescription.describePartial(...args);
  }

  /** Where an inventory entry's add or edit holds its item: the item equipped where asked, what equipping it checks. */
  protected override planPlacement(...args: Parameters<typeof InventoryEntries.planPlacement>) {
    return InventoryEntries.planPlacement(...args);
  }

  /** How a new character's ability scores are set: the SRD's methods, the scores' bounds, each score's modifier. */
  override describeCreation(...args: Parameters<typeof NewCharacters.describeCreation>) {
    return NewCharacters.describeCreation(...args);
  }

  /** Why a location can't take one more item of the character's, if it can't: what the inventory dialogs warn of. */
  override describePlacement(...args: Parameters<typeof InventoryEntries.describePlacement>) {
    return InventoryEntries.describePlacement(...args);
  }

  /** A character's printed sheet: the PDF document the server renders. */
  override describeSheet(...args: Parameters<typeof CharacterSheet.describeSheet>) {
    return CharacterSheet.describeSheet(...args);
  }

  /** The race picker of a new character: the races it offers, and whether each is eligible. */
  override openRacePicker(view: RulesetView, query: RacePickQuery) {
    return new RacePicker(view, query);
  }
}
