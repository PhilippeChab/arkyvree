import type { CharacterInput } from "@/engine/core/module/CharacterInputs.ts";
import type {
  CharacterCard,
  DescribedInventoryEntry,
  InventoryEntryChange,
  InventoryEntryFields,
  MemberReading,
  NewCharacterPlan,
  PrivateNotes,
} from "@/engine/core/module/characters.ts";
import type { Descriptions } from "@/engine/core/module/contract.ts";
import type { OpenedPicker } from "@/engine/core/module/pickers.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { Item } from "@/shared/relations.ts";

/**
 * What a ruleset answers of its characters, from the rows the server reads: their sheets (as the API answers them, as
 * a member reads them, printed), their cards and inventories, a new one's ability scores and the races it can pick,
 * and an inventory entry's add or edit. Its descriptions are the ruleset's own (`D`).
 */
export default abstract class CharactersPart<D extends Descriptions> {
  /**
   * Refuses languages a character can't speak: one of `languageIds` not found (`languages`, the rows the server read
   * for them), or not of the character's ruleset nor of its source chain.
   */
  abstract checkLanguages(view: RulesetView, languageIds: string[], languages: { rulesetId: string }[]): void;

  /**
   * A character's sheet as the API answers it: a player character's with its bonded creatures' (`bonded`), their
   * private notes as the viewer reads them (`notes`); or a bonded creature's, from its master's.
   */
  abstract describe(
    view: RulesetView,
    character: CharacterInput,
    bonded: CharacterInput[],
    notes?: PrivateNotes,
  ): D["sheet"];

  /** A character's card, as a list of characters shows it, from its race and its levels' class levels. */
  abstract describeCard(
    view: RulesetView,
    character: { raceId: string },
    levels: { klassLevelId: string }[],
  ): CharacterCard;

  /** A character as a campaign member reads it (`reading`): partly, or its sheet with its private notes shown or blank. */
  abstract describeForMember(
    view: RulesetView,
    character: CharacterInput,
    bonded: CharacterInput[],
    reading: MemberReading,
  ): D["memberSheet"];

  /** A character's inventory entries (each with the item row it names), as its sheet lists them. */
  abstract describeInventory<T extends { itemId: string; itemsInRule: Item }>(
    view: RulesetView,
    entries: T[],
  ): DescribedInventoryEntry<T>[];

  /** A character's printed sheet: the document the server renders. */
  abstract describeSheet(
    view: RulesetView,
    character: CharacterInput,
    options: { diagnostics: boolean; portraitUrl?: string | null },
  ): D["sheetDocument"];

  /** The race picker of a new character of what its form says (`identity`): the races it offers, each checked. */
  abstract openRacePicker(
    view: RulesetView,
    identity: { alignment?: string; gender?: string },
  ): OpenedPicker<{ kind: string }, { id: string }, D["raceOption"]>;

  /** What a new character stores beside its row: its ability scores. Refused when its race can't be a player's. */
  abstract planCreate(view: RulesetView, body: { abilities: Record<string, number>; raceId: string }): NewCharacterPlan;

  /** What an inventory entry's add or edit stores, checked: its placement and charges, the item equipped where asked. */
  abstract planInventoryEntry(
    view: RulesetView,
    character: CharacterInput,
    change: InventoryEntryChange,
  ): InventoryEntryFields;
}
