import {
  type CharacterInput,
  CharactersPart,
  type CreationPickQuery,
  type StoredAdvancement,
} from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { Dnd35Descriptions } from "@/engine/rulesets/dnd3.5/descriptions.ts";
import { ITEM_FIELDS } from "@/engine/rulesets/dnd3.5/entities/items/fields.ts";
import RacePicker from "@/engine/rulesets/dnd3.5/pickers/RacePicker.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { type Item, type Race } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import type { Character } from "@/shared/relations.ts";
import { PLAYER_CHARACTER_KIND } from "@/vocabulary/dnd3.5/bondedKinds.ts";

import CharacterCards from "./CharacterCards.ts";
import CharacterDescription from "./description/CharacterDescription.ts";
import IdentityFields from "./IdentityFields.ts";
import InventoryEntries from "./inventory/InventoryEntries.ts";
import SpokenLanguages from "./languages/SpokenLanguages.ts";
import NewCharacters from "./NewCharacters.ts";
import CharacterSheet from "./sheet/CharacterSheet.tsx";

/**
 * The 3.5 characters, as the module answers the server of them: their sheets, as the API answers them, as a member who
 * reads one partly reads it, and printed; the languages they speak and may pick (their `speaks` links); where an
 * item goes and what equipping one checks, and how a new one's ability scores are set (their `score` links) and the
 * races it can pick (its `race` link), a player character's alone. The characters part reads the private notes as the
 * viewer does, and checks an item's ruleset and charges, a language's, and the scores' bounds.
 */
export default class Dnd35Characters extends CharactersPart<Dnd35Descriptions> {
  /** A new character's race: a player character's (of kind `pc`), not a monster's or a bonded creature's. */
  protected override checkCreationPick(view: RulesetView, _role: string, race: Race) {
    if (race.partition !== PLAYER_CHARACTER_KIND)
      throw new RulesError("invalid", `${view.rulesetData.labelOf("races")} is not valid for a player character`);
  }

  /** A character's printed sheet: the PDF document the server renders. */
  protected override describeDocument(...args: Parameters<typeof CharacterSheet.describeSheet>) {
    return CharacterSheet.describeSheet(...args);
  }

  /** A character's sheet as the API answers it, with its bonded creatures', or a creature's. */
  protected override describeFull(...args: Parameters<typeof CharacterDescription.describeFull>) {
    return CharacterDescription.describeFull(...args);
  }

  /** A character's card: its race and its classes at their highest level. */
  protected override describeFullCard(view: RulesetView, character: Character, advancements: StoredAdvancement[]) {
    return CharacterCards.describe(Dnd35View.of(view.rulesetData), character, advancements);
  }

  /** An inventory entry beside its row: where its item can go, and where it's worn. */
  protected override describeInventoryEntry(...args: Parameters<typeof InventoryEntries.describeInventoryEntry>) {
    return InventoryEntries.describeInventoryEntry(...args);
  }

  /** An inventory entry's item's fields, as an item's answer carries them: its weapon's, its armor's, its charges… */
  protected override describeInventoryItemFields(item: Item) {
    return ITEM_FIELDS.readByField(item);
  }

  /** What a character speaks without picking it, its picked languages, and what one more may add. */
  protected override describeLinkRoom(view: RulesetView, character: CharacterInput, _role: string, picks: string[]) {
    return new SpokenLanguages(view, character).describe(picks);
  }

  /** What a campaign member who reads a character partly reads of its sheet: its identity's block and its summary. */
  protected override describePartial(...args: Parameters<typeof CharacterDescription.describePartial>) {
    return CharacterDescription.describePartial(...args);
  }

  /**
   * How a new character's ability scores are set (its one scored link's, `score`): the ruleset's abilities, the
   * SRD's methods, the scores' bounds, each score's modifier.
   */
  protected override describeScores(view: RulesetView) {
    return NewCharacters.describeCreation(Dnd35View.of(view.rulesetData));
  }

  /** The languages an edit stores: a new one refused when secret, or past the room its rules give the picks. */
  protected override fitLinks(view: RulesetView, character: CharacterInput, _role: string, picks: string[]) {
    return new SpokenLanguages(view, character).plan(picks);
  }

  /** The race picker of a new character: the races it offers, and whether each is eligible. */
  protected override openPicker(view: RulesetView, _role: string, query: CreationPickQuery) {
    return new RacePicker(view, query);
  }

  /** What an edit of a character's identity writes: its fields, each checked as declared, and its description. */
  protected override planFields(...args: Parameters<typeof IdentityFields.plan>) {
    return IdentityFields.plan(...args);
  }

  /** What a new character's fields write, as declared: its alignment, gender and experience, and its other details. */
  protected override planNewFields(...args: Parameters<typeof NewCharacters.planFields>) {
    return NewCharacters.planFields(...args);
  }

  /** Where an inventory entry's add or edit holds its item: the item equipped where asked, what equipping it checks. */
  protected override planPlacement(...args: Parameters<typeof InventoryEntries.planPlacement>) {
    return InventoryEntries.planPlacement(...args);
  }

  /** Why a location can't take one more item of the character's, if it can't: what the inventory dialogs warn of. */
  override describePlacement(...args: Parameters<typeof InventoryEntries.describePlacement>) {
    return InventoryEntries.describePlacement(...args);
  }
}
