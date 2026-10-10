import { z } from "zod";

import type { CharacterInput } from "@/engine/core/module/CharacterInputs.ts";
import type { Descriptions } from "@/engine/core/module/contract.ts";
import type { OpenedPicker } from "@/engine/core/module/pickers.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { Item, Property } from "@/shared/relations.ts";

import type {
  CharacterCard,
  CharacterCreation,
  DescribedInventoryEntry,
  DescribedSheet,
  HeldInventoryEntry,
  NotedSheet,
  PlacementDescription,
} from "./descriptions.ts";
import type { AbilitiesPlan, InventoryEntryPlan, NewCharacterPlan } from "./plans.ts";
import type {
  AbilitiesRequest,
  InventoryEntryChange,
  MemberReading,
  NewCharacterRequest,
  PlacementQuery,
  PrivateNotes,
  RacePickQuery,
  SheetRequest,
} from "./requests.ts";

/** How a reader who doesn't read a character's private notes reads them: blank, or no field at all. */
type HiddenNotes = Exclude<PrivateNotes, "show">;

/**
 * What a ruleset answers of its characters, from the rows the server reads: their sheets (as the API answers them, as
 * a member reads them, printed), their cards and inventories, how a new one's ability scores are set, what it stores
 * and the races it can pick, and an inventory entry's add or edit. Its descriptions are the ruleset's own (`D`). What
 * reads the schema's rows alone is every ruleset's: what a character takes from its ruleset, its languages, its card,
 * its inventory. So are the checks that guard a character's privacy and integrity, which no ruleset can skip: a reader
 * reads the private notes the reading gives them, an item is of the character's ruleset and its charges agree, a score
 * is within the ruleset's bounds and a new character's race is a player's. Their operations are this part's, over
 * hooks for what a ruleset describes or checks its own way (`describeFull`, `describePartial`, `planPlacement`,
 * `describeCreation`).
 */
export default abstract class CharactersPart<D extends Descriptions> {
  /** A form's ability scores, by ability id: each a whole number within the ruleset's bounds (`scores`). */
  private static boundedScores({ max, min }: CharacterCreation["scores"]) {
    return z.record(z.string(), z.number().int().min(min).max(max));
  }

  /** An entry's charges: both set or both null, and no more remaining than total. */
  private static checkCharges(totalCharges: number | null, remainingCharges: number | null) {
    if ((totalCharges === null) !== (remainingCharges === null))
      throw new RulesError("invalid", "Total charges and remaining charges must both be set or both be null");

    if (totalCharges !== null && remainingCharges !== null && remainingCharges > totalCharges)
      throw new RulesError("invalid", "Remaining charges cannot exceed total charges");
  }

  /**
   * A sheet's private notes as a reader who doesn't read them reads them: a copy with them blank or left out, so the
   * response keeps its shape.
   */
  private static redactNotes<S extends NotedSheet>(sheet: S, notes: HiddenNotes): S {
    const privateNotes = notes === "blank" ? "" : undefined;
    return { ...sheet, identity: { ...sheet.identity, background: { ...sheet.identity.background, privateNotes } } };
  }

  /** A sheet's private notes, and its bonded creatures', as a reader who doesn't read them reads them. */
  private static redactSheet<S extends DescribedSheet>(sheet: S, notes: HiddenNotes): S {
    const bonded = Object.fromEntries(
      Object.entries(sheet.bonded).map(([kind, creature]) => [kind, CharactersPart.redactNotes(creature, notes)]),
    );
    return { ...CharactersPart.redactNotes(sheet, notes), bonded };
  }

  /**
   * A character's rows without its private notes, nor its master's: what a reader who doesn't read them is described
   * from, so no ruleset's description can show them.
   */
  private static withoutNotes(input: CharacterInput): CharacterInput {
    return {
      ...input,
      ...(input.master && { master: CharactersPart.withoutNotes(input.master) }),
      record: { ...input.record, privateNotes: null },
    };
  }

  /**
   * Refuses rows a character can't take from its ruleset (`rows`, each with the ruleset it's of): rows of neither the
   * view's ruleset, the character's, nor its source chain.
   */
  static checkFromRuleset(view: RulesetView, rows: { rulesetId: string }[], message: string) {
    const rulesetIds = new Set([view.ruleset.id, ...view.rulesetData.cow.sourceChain]);
    if (rows.some((row) => !rulesetIds.has(row.rulesetId))) throw new RulesError("invalid", message);
  }

  /**
   * A character's sheet as the API answers it, its private notes where every ruleset's holds them (`NotedSheet`), as
   * its rows have them (none when its reader doesn't read them): a player character's with its bonded creatures'
   * (`bonded`), each noted; or a bonded creature's, from its master's.
   */
  protected abstract describeFull(view: RulesetView, character: CharacterInput, bonded: CharacterInput[]): D["sheet"];

  /**
   * What the ruleset shows of an inventory entry (`entry`, of `item`, with its `properties`) beside its row: where its
   * item can go, where it's worn.
   */
  protected abstract describeInventoryEntry(
    entry: HeldInventoryEntry,
    item: Item,
    properties: Property[],
  ): D["inventoryEntry"];

  /**
   * What a campaign member who reads a character partly reads of it (`character`, its rows without its private notes):
   * who it is and what it looks like, without its bonded creatures.
   */
  protected abstract describePartial(view: RulesetView, character: CharacterInput): D["partialSheet"];

  /**
   * Where an inventory entry's add or edit (`change`) holds its item: whether it's equipped, where, and its weapon set
   * in a hand. Refused when the item can't be equipped where it's asked to be, its requirements checked unless
   * `force`d.
   */
  protected abstract planPlacement(
    view: RulesetView,
    character: CharacterInput,
    change: InventoryEntryChange,
    force: boolean,
  ): HeldInventoryEntry;

  /**
   * How a new character's ability scores are set: the ways its form offers, run by their kind, the scores' bounds and
   * the one an unset ability shows, and each score's modifier over those bounds. What its creation and an ability edit
   * check their scores by, and start an unset one at.
   */
  abstract describeCreation(view: RulesetView): CharacterCreation;

  /**
   * Why a placement (`query`: its location, in its weapon set for a hand) can't take one more item of the character's,
   * if it can't: the entry in the way, the entry placed (none for a new one) aside. What the inventory dialogs warn of,
   * and an add refuses.
   */
  abstract describePlacement(view: RulesetView, character: CharacterInput, query: PlacementQuery): PlacementDescription;

  /** A character's printed sheet: the document the server renders. */
  abstract describeSheet(view: RulesetView, character: CharacterInput, request: SheetRequest): D["sheetDocument"];

  /** The race picker of a new character of what its form says (`query`): the races it offers, each checked. */
  abstract openRacePicker(
    view: RulesetView,
    query: RacePickQuery,
  ): OpenedPicker<{ kind: string }, { id: string }, D["raceOption"]>;

  /**
   * Refuses languages a character can't speak: one of `languageIds` not found (`languages`, the rows the server read
   * for them), or not of the character's ruleset nor of its source chain.
   */
  checkLanguages(view: RulesetView, languageIds: string[], languages: { rulesetId: string }[]) {
    if (languages.length !== languageIds.length) throw new RulesError("invalid", "Some languages were not found");
    CharactersPart.checkFromRuleset(view, languages, "Some languages do not belong to the character's ruleset");
  }

  /**
   * A character's sheet as the API answers it (`describeFull`): a player character's with its bonded creatures'
   * (`bonded`), or a bonded creature's, from its master's; their private notes as the viewer reads them (`notes`): all
   * of them, a blank, or no field. A viewer who doesn't read them reads none: the ruleset describes rows without them,
   * and the sheet's, its creatures' too, are blanked or left out where every ruleset's holds them (`NotedSheet`).
   */
  describe(
    view: RulesetView,
    character: CharacterInput,
    bonded: CharacterInput[],
    notes: PrivateNotes = "show",
  ): D["sheet"] {
    if (notes === "show") return this.describeFull(view, character, bonded);
    const creatures = bonded.map((input) => CharactersPart.withoutNotes(input));
    const sheet = this.describeFull(view, CharactersPart.withoutNotes(character), creatures);
    return CharactersPart.redactSheet(sheet, notes);
  }

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

  /**
   * A character as a campaign member reads it (`reading`): partly, from its rows without its private notes nor its
   * bonded creatures (`describePartial`), or its sheet with its bonded creatures', their private notes shown or blank.
   */
  describeForMember(
    view: RulesetView,
    character: CharacterInput,
    bonded: CharacterInput[],
    reading: MemberReading,
  ): D["partialSheet"] | D["sheet"] {
    if (reading === "partial") return this.describePartial(view, CharactersPart.withoutNotes(character));
    return this.describe(view, character, bonded, reading);
  }

  /**
   * The character's entries (`entries`, each with the item row it names), as its sheet lists them: each with what its
   * ruleset shows of it (`describeInventoryEntry`), and its item as the view composes it (the stored row's copy or
   * winner, the row itself without one), its properties, its modifiers, and its requirements, its template's before
   * its own.
   */
  describeInventory<T extends HeldInventoryEntry & { itemId: string; itemsInRule: Item }>(
    view: RulesetView,
    entries: T[],
  ): DescribedInventoryEntry<T, D["inventoryEntry"]>[] {
    const { rulesetData } = view;
    return entries.map((entry) => {
      // The join still contains the stored parent row after itemId resolves.
      const item = rulesetData.itemsById.get(entry.itemId) ?? entry.itemsInRule;
      const properties = rulesetData.itemProperties(item);
      const { own: requirements, template: proficiency } = rulesetData.itemRequirements(item);
      return {
        ...entry,
        ...this.describeInventoryEntry(entry, item, properties),
        item: {
          ...item,
          properties,
          modifiers: rulesetData.modifiersBySource.get(item.id) ?? [],
          requirements: [...proficiency, ...requirements],
        },
      };
    });
  }

  /**
   * The ability scores a character's edit stores (`abilities`, by ability id), each under the id its form gives.
   * Refused when a score is past the ruleset's bounds (`describeCreation`), or one isn't an ability of its ruleset.
   */
  planAbilities(view: RulesetView, abilities: AbilitiesRequest): AbilitiesPlan {
    RulesError.parse(CharactersPart.boundedScores(this.describeCreation(view).scores), abilities);
    const { abilitiesById } = view.rulesetData;
    if (Object.keys(abilities).some((abilityId) => !abilitiesById.has(abilityId)))
      throw new RulesError("not-found", "Ability not found");
    return { abilities: Object.entries(abilities).map(([abilityId, score]) => ({ abilityId, score })) };
  }

  /**
   * What a new character stores beside its row: a score for each of the ruleset's abilities, the one its form gives
   * (`abilities`, by ability id) or the one an unset ability starts at (`describeCreation`). Refused when a score is
   * past the ruleset's bounds, or its race isn't the ruleset's or isn't a player character's (of kind `pc`).
   */
  planCreate(view: RulesetView, request: NewCharacterRequest): NewCharacterPlan {
    const { rulesetData } = view;
    const { scores } = this.describeCreation(view);
    RulesError.parse(CharactersPart.boundedScores(scores), request.abilities, ["abilities"]);
    const race = rulesetData.racesById.get(request.raceId);
    if (!race) throw new RulesError("not-found", "Race not found in this ruleset");
    if (race.kind !== "pc") throw new RulesError("invalid", "Race is not valid for a player character");
    return {
      abilities: rulesetData.abilities.map((ability) => ({
        abilityId: ability.id,
        score: request.abilities[ability.id] ?? scores.start,
      })),
    };
  }

  /**
   * What an inventory entry's add or edit stores, checked: its placement (`planPlacement`: the item equipped where
   * asked, its requirements checked unless `force`d) and its charges. Refused when an added item isn't the character's
   * ruleset's (nor from its source chain), or its charges disagree.
   */
  planInventoryEntry(
    view: RulesetView,
    character: CharacterInput,
    change: InventoryEntryChange,
    force: boolean,
  ): InventoryEntryPlan {
    const { remainingCharges, totalCharges } = change.request;
    if ("item" in change)
      CharactersPart.checkFromRuleset(view, [change.item], "Item does not belong to the character's ruleset");
    CharactersPart.checkCharges(totalCharges, remainingCharges);
    return {
      ...this.planPlacement(view, character, change, force),
      totalCharges: totalCharges ?? null,
      remainingCharges: remainingCharges ?? null,
    };
  }
}
