import { z } from "zod";

import type { CharacterInput } from "@/engine/core/module/CharacterInputs.ts";
import type { Descriptions } from "@/engine/core/module/contract.ts";
import type { OpenedPicker } from "@/engine/core/module/pickers.ts";
import RulesError from "@/engine/core/RulesError.ts";
import { RequestIds, type RulesetView } from "@/engine/core/view/index.ts";
import type { Item, Property } from "@/shared/relations.ts";

import type {
  CharacterCard,
  CharacterCreation,
  DescribedInventoryEntry,
  HeldInventoryEntry,
  LanguagesDescription,
  NotedSheet,
  PlacementDescription,
} from "./descriptions.ts";
import type {
  AbilitiesPlan,
  CharacterColumns,
  CharacterEditPlan,
  FieldsPlan,
  InventoryEntryPlan,
  LanguagesPlan,
  NewCharacterPlan,
  StartPlan,
} from "./plans.ts";
import type {
  AbilitiesRequest,
  CharacterEditRequest,
  FieldsRequest,
  InventoryEntryChange,
  MemberReading,
  NewCharacterRequest,
  PlacementChange,
  PlacementQuery,
  PrivateNotes,
  RacePickQuery,
  SheetRequest,
  StartRequest,
} from "./requests.ts";


/**
 * What a ruleset answers of its characters, from the rows the server reads: their sheets (as the API answers them, as a
 * member reads them, printed), their cards, languages and inventories, how a new one's ability scores are set, what it
 * stores and the races it can pick, a languages edit, and an inventory entry's add or edit. Its descriptions are the
 * ruleset's own (`D`). What reads the schema's rows alone is every ruleset's: what a character takes from its ruleset,
 * its inventory. So are the checks that guard a character's privacy and integrity, which no ruleset can skip: a reader
 * reads the private notes the reading gives them, a partly seen character's card and summary name none of its build, an
 * entity a request names is one its ruleset's view shows (a race, an ability, a language, an item: `RequestIds`, which
 * reads a source's id as its copy's), an entry's charges agree, a score is within the ruleset's bounds and a new
 * character's race is a player's. Their operations are this part's, over hooks for what a ruleset describes or checks
 * its own way (`describeFull`, `describePartial`, `describeFullCard`, `planPlacement`, `describeCreation`, and the
 * languages a character speaks and may pick: `describeLanguageRoom`, `fitLanguages`).
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

  /** The entities a request about a character names, as its ruleset's view reads them. */
  private static idsOf(view: RulesetView) {
    return new RequestIds(view.rulesetData, "the character's ruleset");
  }

  /**
   * A sheet as a reader who doesn't read its private notes reads it: a copy whose `fields` blocks hold none, blank or
   * left out alike, since a block holds them for who reads them alone.
   */
  private static redactNotes<S extends NotedSheet>(sheet: S): S {
    // Its fields' private notes go: a block shows them to who reads them alone
    const blocks = sheet.blocks.map((block) =>
      block.kind === "fields" && block.notes ? { ...block, notes: { notes: block.notes.notes } } : block,
    );
    return { ...sheet, blocks };
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
   * A character's sheet as the API answers it, its private notes where every ruleset's holds them (`NotedSheet`), as
   * its rows have them (none when its reader doesn't read them): a player character's with its bonded creatures'
   * (`bonded`), each noted; or a bonded creature's, from its master's.
   */
  protected abstract describeFull(view: RulesetView, character: CharacterInput, bonded: CharacterInput[]): D["sheet"];

  /**
   * The card of a character (`character`, with its levels, `levels`), as a list of characters shows it to a reader who
   * sees all of it, named as its ruleset's view names what it shows, a copied or renamed one by its own name.
   */
  protected abstract describeFullCard(
    view: RulesetView,
    character: { raceId: string },
    levels: { klassLevelId: string }[],
  ): CharacterCard;

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
   * What a character (`character`) speaks, and what its picked languages (`languageIds`, each the view's) leave it room
   * for, as the ruleset's rules give it languages: what its languages picker offers.
   */
  protected abstract describeLanguageRoom(
    view: RulesetView,
    character: CharacterInput,
    languageIds: string[],
  ): LanguagesDescription;

  /**
   * What a campaign member who reads a character partly reads of it (`character`, its rows without its private notes):
   * who it is and what it looks like, without its bonded creatures.
   */
  protected abstract describePartial(view: RulesetView, character: CharacterInput): D["partialSheet"];

  /**
   * The languages of an edit (`languageIds`, each the view's) a character (`character`) stores: those it picked, past
   * those its rules give it without a pick. Refused, naming it, when one it doesn't keep (its rows' own) is past what
   * the ruleset's rules let it speak; one it keeps never is.
   */
  protected abstract fitLanguages(view: RulesetView, character: CharacterInput, languageIds: string[]): string[];

  /**
   * What an edit of a character's (`character`) fields (`request`, by the keys its sheet's `fields` block gives them)
   * writes, each checked: refused when it names a field the character hasn't, or a value its field doesn't take
   * (`planEdit`).
   */
  protected abstract planFields(view: RulesetView, character: CharacterInput, request: FieldsRequest): FieldsPlan;

  /**
   * What a new character's fields (`fields`, its form's, by their keys) write: their columns, each checked, refused when
   * one its form requires is missing or a value is one its field doesn't take.
   */
  protected abstract planNewFields(fields: FieldsRequest): { columns: CharacterColumns };

  /**
   * Where an inventory entry's add or edit (`change`) holds its item: whether it's equipped, where, and its weapon set
   * in a hand. Refused when the item can't be equipped where it's asked to be, its requirements checked unless
   * `force`d.
   */
  protected abstract planPlacement(
    view: RulesetView,
    character: CharacterInput,
    change: PlacementChange,
    force: boolean,
  ): HeldInventoryEntry;

  /**
   * How a new character's ability scores are set: the ruleset's abilities, in its sheet's order, the ways its form
   * offers, run by their kind, the scores' bounds and the one an unset ability shows, and each score's modifier over
   * those bounds. What its creation and an ability edit check their scores by, and start an unset one at.
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
   * A character's sheet as the API answers it (`describeFull`): a player character's with its bonded creatures'
   * (`bonded`), or a bonded creature's, from its master's; their private notes as the viewer reads them (`notes`): all
   * of them, a blank, or no field. A viewer who doesn't read them reads none: the ruleset describes rows without them,
   * and the sheet's `fields` blocks hold none (`NotedSheet`).
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
    return CharactersPart.redactNotes(sheet);
  }

  /**
   * The card of a character (`character`, with its levels, `levels`), as a list of characters shows it: a partly seen
   * one's (`partial`) holds the chips its ruleset marks as its partial reading's alone.
   */
  describeCard(
    view: RulesetView,
    character: { raceId: string },
    levels: { klassLevelId: string }[],
    partial: boolean,
  ): CharacterCard {
    const card = this.describeFullCard(view, character, levels);
    if (!partial) return card;
    return { ...card, chips: card.chips.filter((chip) => chip.partial) };
  }

  /**
   * A character as a campaign member reads it (`reading`): partly, from its rows without its private notes nor its
   * bonded creatures (`describePartial`), its summary with no tracks, or its sheet with its bonded creatures', their
   * private notes shown or blank.
   */
  describeForMember(
    view: RulesetView,
    character: CharacterInput,
    bonded: CharacterInput[],
    reading: MemberReading,
  ): D["partialSheet"] | D["sheet"] {
    if (reading === "partial") {
      const sheet = this.describePartial(view, CharactersPart.withoutNotes(character));
      return { ...sheet, summary: { ...sheet.summary, tracks: [] } };
    }
    return this.describe(view, character, bonded, reading);
  }

  /**
   * The character's entries (`entries`, each naming its item), as its sheet lists them: each with what its ruleset
   * shows of it (`describeInventoryEntry`), and its item as the view composes it (`RulesetData.entriesWithItems`), its
   * properties, its modifiers, and its requirements, its template's before its own.
   */
  describeInventory<T extends HeldInventoryEntry & { itemId: string }>(
    view: RulesetView,
    entries: T[],
  ): DescribedInventoryEntry<T, D["inventoryEntry"]>[] {
    const { rulesetData } = view;
    return rulesetData.entriesWithItems(entries).map(({ entry, item }) => {
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
   * What a character speaks, and what its picked languages (`languageIds`, as an edit is being made) leave it room for
   * (`describeLanguageRoom`), each language by the id the view keys it by. Refused, naming it, when one isn't a language
   * of the character's ruleset, or is sent twice.
   */
  describeLanguages(view: RulesetView, character: CharacterInput, languageIds: string[]): LanguagesDescription {
    const picks = CharactersPart.idsOf(view).resolveAll("languages", languageIds);
    return this.describeLanguageRoom(view, character, picks);
  }

  /**
   * The ability scores a character's edit stores (`abilities`, by ability id), each under the id the view keys its
   * ability by. Refused when a score is past the ruleset's bounds (`describeCreation`), or names no ability of its
   * ruleset, or two name one.
   */
  planAbilities(view: RulesetView, abilities: AbilitiesRequest): AbilitiesPlan {
    RulesError.parse(CharactersPart.boundedScores(this.describeCreation(view).scores), abilities);
    const scores = CharactersPart.idsOf(view).resolveKeys("abilities", abilities);
    return { abilities: [...scores].map(([abilityId, score]) => ({ abilityId, score })) };
  }

  /**
   * What a new character stores: what it starts with (`planStart`), and its fields' columns (`planNewFields`). Refused as
   * its start is, or when a field is.
   */
  planCreate(view: RulesetView, request: NewCharacterRequest): NewCharacterPlan {
    const { fields, ...start } = request;
    return { ...this.planStart(view, start), columns: this.planNewFields(fields).columns };
  }

  /**
   * What an edit of a character (`edit`) writes: its fields' columns (`planFields`), each checked, and its languages, when
   * it sends them (`planLanguages`).
   */
  planEdit(view: RulesetView, character: CharacterInput, edit: CharacterEditRequest): CharacterEditPlan {
    return {
      columns: edit.fields ? this.planFields(view, character, edit.fields).columns : {},
      ...(edit.languageIds && { languages: this.planLanguages(view, character, edit.languageIds) }),
    };
  }

  /**
   * What an inventory entry's add or edit stores, checked: its item (an added one's, as the view has it), its placement
   * (`planPlacement`: the item equipped where asked, its requirements checked unless `force`d) and its charges. Refused
   * when an added item isn't one of the ruleset's (unknown, of an unrelated ruleset, or deleted), or its charges
   * disagree.
   */
  planInventoryEntry(
    view: RulesetView,
    character: CharacterInput,
    change: InventoryEntryChange,
    force: boolean,
  ): InventoryEntryPlan {
    const { request } = change;
    const placed: PlacementChange =
      "itemId" in change ? { item: CharactersPart.idsOf(view).find("items", change.itemId), request } : change;
    CharactersPart.checkCharges(request.totalCharges, request.remainingCharges);
    return {
      ...this.planPlacement(view, character, placed, force),
      itemId: "item" in placed ? placed.item.id : placed.entry.itemId,
      totalCharges: request.totalCharges ?? null,
      remainingCharges: request.remainingCharges ?? null,
    };
  }

  /**
   * The languages a character's edit (`languageIds`) stores, each by the id the view keys it by: those it picked, past
   * those its rules give it (`fitLanguages`). Refused, naming it, when one isn't a language of the character's ruleset
   * (unknown, of an unrelated ruleset, or deleted), is sent twice (by one id, or by its source's and its copy's), or is
   * a new pick past what the rules let the character speak.
   */
  planLanguages(view: RulesetView, character: CharacterInput, languageIds: string[]): LanguagesPlan {
    const picks = CharactersPart.idsOf(view).resolveAll("languages", languageIds);
    return { languageIds: this.fitLanguages(view, character, picks) };
  }

  /**
   * What a new character starts with, as its form or its import gives it: its race, and a score for each of the
   * ruleset's abilities, the one given (`abilities`, by ability id) or the one an unset ability starts at
   * (`describeCreation`), each by the id the view keys it by. Refused when a score is past the ruleset's bounds, its race
   * or an ability isn't one of the ruleset's, two scores name one ability, or its race isn't a player character's (of
   * kind `pc`).
   */
  planStart(view: RulesetView, request: StartRequest): StartPlan {
    const { scores } = this.describeCreation(view);
    RulesError.parse(CharactersPart.boundedScores(scores), request.abilities, ["abilities"]);
    const ids = CharactersPart.idsOf(view);
    const race = ids.find("races", request.raceId);
    if (race.kind !== "pc") throw new RulesError("invalid", "Race is not valid for a player character");
    const given = ids.resolveKeys("abilities", request.abilities);
    return {
      abilities: view.rulesetData.abilities.map((ability) => ({
        abilityId: ability.id,
        score: given.get(ability.id) ?? scores.start,
      })),
      raceId: race.id,
    };
  }
}
