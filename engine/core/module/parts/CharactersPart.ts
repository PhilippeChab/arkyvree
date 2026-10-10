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
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { Item } from "@/shared/relations.ts";

/**
 * What a ruleset answers of its characters, from the rows the server reads: their sheets (as the API answers them, as
 * a member reads them, printed), their cards and inventories, a new one's ability scores and the races it can pick,
 * and an inventory entry's add or edit. Its descriptions are the ruleset's own (`D`). What reads the schema's rows
 * alone is every ruleset's: what a character takes from its ruleset, its languages, its card, its inventory.
 */
export default abstract class CharactersPart<D extends Descriptions> {
  /**
   * Refuses rows a character can't take from its ruleset (`rows`, each with the ruleset it's of): rows of neither the
   * view's ruleset, the character's, nor its source chain.
   */
  static checkFromRuleset(view: RulesetView, rows: { rulesetId: string }[], message: string) {
    const rulesetIds = new Set([view.ruleset.id, ...view.rulesetData.cow.sourceChain]);
    if (rows.some((row) => !rulesetIds.has(row.rulesetId))) throw new RulesError("invalid", message);
  }

  /**
   * Refuses languages a character can't speak: one of `languageIds` not found (`languages`, the rows the server read
   * for them), or not of the character's ruleset nor of its source chain.
   */
  checkLanguages(view: RulesetView, languageIds: string[], languages: { rulesetId: string }[]) {
    if (languages.length !== languageIds.length) throw new RulesError("invalid", "Some languages were not found");
    CharactersPart.checkFromRuleset(view, languages, "Some languages do not belong to the character's ruleset");
  }

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

  /**
   * The card of a character (`character`, with its levels, `levels`), as a list of characters shows it, named as its
   * ruleset's view names its race and classes, a copied or renamed one by its own name: each class at the highest
   * level the character has in it, and its total.
   */
  describeCard(view: RulesetView, character: { raceId: string }, levels: { klassLevelId: string }[]): CharacterCard {
    const { rulesetData } = view;
    const levelByKlassName = new Map<string, number>();
    for (const level of levels) {
      const klassLevel = rulesetData.klassLevelsById.get(level.klassLevelId);
      if (!klassLevel) continue;
      const klassName = rulesetData.klassesById.get(klassLevel.klassId)?.name || "Unknown";
      if (klassLevel.level > (levelByKlassName.get(klassName) || 0)) levelByKlassName.set(klassName, klassLevel.level);
    }
    const classLevels = [...levelByKlassName].map(([klass, level]) => ({ klass, level }));
    return {
      levels: classLevels,
      race: rulesetData.racesById.get(character.raceId)?.name ?? "Unknown",
      totalLevel: classLevels.reduce((sum, { level }) => sum + level, 0),
    };
  }

  /** A character as a campaign member reads it (`reading`): partly, or its sheet with its private notes shown or blank. */
  abstract describeForMember(
    view: RulesetView,
    character: CharacterInput,
    bonded: CharacterInput[],
    reading: MemberReading,
  ): D["memberSheet"];

  /**
   * The character's entries (`entries`, each with the item row it names), as its sheet lists them: each with its item
   * as the view composes it (the stored row's copy or winner, the row itself without one), its properties, its
   * modifiers, and its requirements, its template's before its own.
   */
  describeInventory<T extends { itemId: string; itemsInRule: Item }>(
    view: RulesetView,
    entries: T[],
  ): DescribedInventoryEntry<T>[] {
    const { rulesetData } = view;
    return entries.map((entry) => {
      // The join still contains the stored parent row after itemId resolves.
      const item = rulesetData.itemsById.get(entry.itemId) ?? entry.itemsInRule;
      const { own: requirements, template: proficiency } = rulesetData.itemRequirements(item);
      return {
        ...entry,
        item: {
          ...item,
          properties: rulesetData.itemProperties(item),
          modifiers: rulesetData.modifiersBySource.get(item.id) ?? [],
          requirements: [...proficiency, ...requirements],
        },
      };
    });
  }

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
