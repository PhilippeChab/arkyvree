import { z } from "zod";

import type { CharacterInput } from "@/engine/core/module/CharacterInputs.ts";
import type { Descriptions } from "@/engine/core/module/contract.ts";
import type { EntityFilters } from "@/engine/core/module/parts/entities/index.ts";
import type { OpenedPicker } from "@/engine/core/module/pickers.ts";
import type { EntityRecord, StorageDeclaration, StoredAdvancement } from "@/engine/core/module/storage.ts";
import RulesError from "@/engine/core/RulesError.ts";
import { type InventoryItem, RequestIds, type RulesetView, type ViewKinds } from "@/engine/core/view/index.ts";
import type { Character as CharacterRecord } from "@/shared/relations.ts";

import type {
  CardChip,
  CharacterCard,
  CharacterColumns,
  DescribedInventoryEntry,
  DescribedSheet,
  HeldInventoryEntry,
  LinkRoom,
  NotedSheet,
  PartialReading,
  PartialSheet,
  PlacementDescription,
  RulesetCard,
  RulesetSheet,
  ScoreBounds,
  ScoresCreation,
} from "./descriptions.ts";
import PartialSheets from "./PartialSheets.ts";
import type {
  CharacterEditPlan,
  FieldsPlan,
  InventoryEntryPlan,
  LinkPicksPlan,
  NewCharacterPlan,
  ScoresPlan,
  StartPlan,
} from "./plans.ts";
import type {
  CharacterEditRequest,
  CreationPickQuery,
  FieldsRequest,
  InventoryEntryChange,
  MemberReading,
  NewCharacterRequest,
  PlacementChange,
  PlacementQuery,
  PrivateNotes,
  ScoresRequest,
  SheetRequest,
  StartRequest,
} from "./requests.ts";

/**
 * What a ruleset answers of its characters, from the rows the server reads: their sheets (as the API answers them, as a
 * member reads them, printed), their cards and inventories, how a new one's scores are set, what it stores and the
 * options its creation's picks offer, its links' edits (a scored link's amounts, a picked link's picks and the room its
 * rules leave them), and an inventory entry's add or edit. Its descriptions are the ruleset's own (`D`). What reads the
 * schema's rows alone is every ruleset's: what a character takes from its ruleset, its links by role (a role its
 * module stores with an amount is scored, `StoredCharacter.scoredRoles`; another it holds many of, picked; a single
 * one, a creation pick), its inventory and a sheet's row's columns (`CharacterColumns`). So are the checks that guard a
 * character's privacy and integrity, which no ruleset can skip: a reader reads the private notes the reading gives
 * them, a sheet answers no share token (whether a reader reads it is the server's access decision), a partly seen
 * character's card shows neither its build nor its description and its partial reading is an allowlist
 * (`PartialSheet`), an entity a request names is one its ruleset's view shows (a pick's, a link's, an item:
 * `RequestIds`, which reads a source's id as its copy's), an entry's charges agree, and a score is within its link's
 * bounds. Their operations are this part's, over hooks for what a ruleset describes or checks its own way
 * (`describeFull`, `describePartial`, `describeDocument`, `describeFullCard`, `planPlacement`, a scored link's
 * creation, `describeScores`, a creation pick's own check and picker, `checkCreationPick` and `openPicker`, and a
 * picked link's room and fit: `describeLinkRoom`, `fitLinks`).
 */
export default abstract class CharactersPart<D extends Descriptions> {
  /** The module's storage, whose character's roles name the kinds this part's requests name. */
  constructor(private readonly storage: StorageDeclaration) {}

  /** The chip of a character whose ruleset a list didn't read, which no ruleset describes: it's unknown. */
  private static readonly UNKNOWN_CHIP: CardChip = { label: "Unknown", partial: true, tone: "secondary" };

  /** An amount of a scored link's, by entity id: each a whole number within its bounds. */
  private static boundedScores({ max, min }: ScoreBounds) {
    return z.record(z.string(), z.number().int().min(min).max(max));
  }

  /**
   * A character's card (`CharacterCard`): its row's id and name, and its description and its ruleset's chips (`chips`),
   * each its declared keys alone; a partly seen one's (`partial`) no description, and the chips its ruleset marks as
   * its partial reading's alone.
   */
  private static cardOf(character: CharacterRecord, chips: CardChip[], partial: boolean): CharacterCard {
    const shown = partial ? chips.filter((chip) => chip.partial) : chips;
    return {
      id: character.id,
      name: character.name,
      description: partial ? null : character.description,
      chips: shown.map((chip) => CharactersPart.chipOf(chip)),
    };
  }

  /** An entry's charges: both set or both null, and no more remaining than total. */
  private static checkCharges(totalCharges: number | null, remainingCharges: number | null) {
    if ((totalCharges === null) !== (remainingCharges === null))
      throw new RulesError("invalid", "Total charges and remaining charges must both be set or both be null");

    if (totalCharges !== null && remainingCharges !== null && remainingCharges > totalCharges)
      throw new RulesError("invalid", "Remaining charges cannot exceed total charges");
  }

  /** A card's chip, its declared keys alone (`CardChip`), in their order: nothing a ruleset adds to it. */
  private static chipOf({ label, partial, tone }: CardChip): CardChip {
    return { label, partial, tone };
  }

  /**
   * The columns a character's sheet opens with (`CharacterColumns`): its row's own (`record`) and its ruleset's (as
   * `view` reads it), and no share token, which the server writes for who may read it.
   */
  private static columnsOf(view: RulesetView, record: CharacterRecord): CharacterColumns {
    const { ruleset } = view;
    return {
      id: record.id,
      userId: record.userId,
      kind: record.kind,
      parentCharacterId: record.parentCharacterId,
      name: record.name,
      rulesetId: record.rulesetId,
      rulesetName: ruleset.name,
      baseRules: ruleset.baseRules,
      deletedAt: record.deletedAt,
      updatedAt: record.updatedAt,
      shareToken: null,
    };
  }

  /** The entities a request about a character names, as its ruleset's view reads them. */
  private static idsOf(view: RulesetView) {
    return new RequestIds(view.rulesetData, "the character's ruleset");
  }

  /**
   * A character's rows as its reader reads them (`reading`), and its parent's: never its share token (whether a reader
   * reads it is the server's access decision), nor its private notes for a reader who doesn't read them, nor its
   * description for one who sees it partly. What a ruleset describes a character from, so no ruleset's description can
   * show them.
   */
  private static readAs(input: CharacterInput, reading: MemberReading): CharacterInput {
    return {
      ...input,
      ...(input.parent && { parent: CharactersPart.readAs(input.parent, reading) }),
      record: CharactersPart.rowAs(input.record, reading),
    };
  }

  /**
   * A sheet as a reader who doesn't read its private notes reads it: a copy whose `fields` blocks hold none, since a
   * block holds them for who reads them alone.
   */
  private static redactNotes<S extends NotedSheet>(sheet: S): S {
    // Its fields' private notes go: a block shows them to who reads them alone
    const blocks = sheet.blocks.map((block) =>
      block.kind === "fields" && block.notes ? { ...block, notes: { notes: block.notes.notes } } : block,
    );
    return { ...sheet, blocks };
  }

  /**
   * A character's row as its reader reads it (`readAs`, `reading`): never its share token, nor its private notes for a
   * reader who doesn't read them, nor its description for one who sees it partly.
   */
  private static rowAs(record: CharacterRecord, reading: MemberReading): CharacterRecord {
    return {
      ...record,
      shareToken: null,
      ...(reading !== "show" && { privateNotes: null }),
      ...(reading === "partial" && { description: null }),
    };
  }

  /**
   * A ruleset's sheet as the API answers it past its row's columns: its declared keys alone (`RulesetSheet`), in their
   * order, so no key a ruleset adds (a row's column among them) reaches its reader.
   */
  private static sheetOf<S extends RulesetSheet>(sheet: S): Pick<S, keyof RulesetSheet> {
    const { blocks, modifiers, requirements, summary, validation } = sheet;
    return { requirements, modifiers, validation, summary, blocks };
  }

  /**
   * The card of a character whose ruleset a list didn't read (`character`, an archived ruleset's), which no ruleset
   * describes: its row's columns as any card's, and a chip saying it's unknown alone, which a partly seen character
   * (`partial`) shows too.
   */
  static describeUnreadCard(character: CharacterRecord, partial: boolean): CharacterCard {
    return CharactersPart.cardOf(character, [CharactersPart.UNKNOWN_CHIP], partial);
  }

  /**
   * Refuses a creation pick (`entity`, the one a new character's single link of `role` names, in a ruleset's `view`) a
   * ruleset's rules don't let a new character make (3.5's race of a kind that isn't a player character's).
   */
  protected abstract checkCreationPick(view: RulesetView, role: string, entity: unknown): void;

  /**
   * The printed sheet of a character (`character`, its rows as its reader reads them: no share token, its private notes
   * only for a reader who reads them): the document the server renders.
   */
  protected abstract describeDocument(
    view: RulesetView,
    character: CharacterInput,
    request: SheetRequest,
  ): D["sheetDocument"];

  /**
   * A character's sheet as the API answers it past its row's columns (`RulesetSheet`), its private notes as its rows
   * have them (none when its reader doesn't read them), and no share token: a character's, its children (`children`)
   * as its blocks show them; or a child's, from its parent's (`parent`).
   */
  protected abstract describeFull(view: RulesetView, character: CharacterInput, children: CharacterInput[]): D["sheet"];

  /**
   * What the ruleset shows on a character's card (`character`, its row without its private notes nor its share token,
   * nor its description for a reader who sees it partly; with its advancements, `advancements`) past its row's columns:
   * its chips, named as its ruleset's view names what they show, a copied or renamed one by its own name.
   */
  protected abstract describeFullCard(
    view: RulesetView,
    character: CharacterRecord,
    advancements: StoredAdvancement[],
  ): RulesetCard;

  /**
   * What the ruleset shows of an inventory entry (`entry`, of `item`, its fields its template's of those it holds none
   * of among them) beside its row: where its item can go, where it's worn.
   */
  protected abstract describeInventoryEntry(entry: HeldInventoryEntry, item: InventoryItem): D["inventoryEntry"];

  /**
   * An inventory entry's item's fields (`item`, its template's of those it holds none of among them), as an item's
   * answer carries them: each as its kind reads it, by its stored field.
   */
  protected abstract describeInventoryItemFields(item: InventoryItem): Record<string, unknown>;

  /**
   * What a character (`character`) has of a picked link's role (`role`), and what its picks (`entityIds`, each the
   * view's) leave it room for, as the ruleset's rules give it them: what its role's picker offers.
   */
  protected abstract describeLinkRoom(
    view: RulesetView,
    character: CharacterInput,
    role: string,
    entityIds: string[],
  ): LinkRoom;

  /**
   * What a campaign member who reads a character partly reads of its ruleset's sheet (`character`, its rows without its
   * private notes, its share token nor its description): its identity's block as such a reader reads it (who it is and
   * what it looks like), and its summary. What the characters part keeps of them is an allowlist (`PartialSheets`).
   */
  protected abstract describePartial(view: RulesetView, character: CharacterInput): PartialReading;

  /**
   * How a new character's scores of a scored link's role (`role`) are set, as its form offers it (3.5's abilities, the
   * ways its form rolls or buys them, their bounds and modifiers): its bounds are what an edit and a new character's
   * form check its amounts by, and start at.
   */
  protected abstract describeScores(view: RulesetView, role: string): ScoresCreation;

  /**
   * The picks of a picked link's edit (`role`, `entityIds`, each the view's) a character (`character`) stores: those it
   * picked, past those its rules give it without a pick. Refused, naming it, when one it doesn't keep (its rows' own)
   * is past what the ruleset's rules let it have; one it keeps never is.
   */
  protected abstract fitLinks(
    view: RulesetView,
    character: CharacterInput,
    role: string,
    entityIds: string[],
  ): string[];

  /**
   * The picker of a new character's creation pick (the single link of `role`, 3.5's race) of what its form says
   * (`query`): the entities it offers, each checked.
   */
  protected abstract openPicker(
    view: RulesetView,
    role: string,
    query: CreationPickQuery,
  ): OpenedPicker<EntityFilters, EntityRecord, D["creationOption"]>;

  /**
   * What an edit of a character's (`character`) fields (`request`, by the keys its sheet's `fields` block gives them)
   * writes, each checked: refused when it names a field the character hasn't, or a value its field doesn't take
   * (`planEdit`).
   */
  protected abstract planFields(view: RulesetView, character: CharacterInput, request: FieldsRequest): FieldsPlan;

  /**
   * What a new character's fields (`fields`, its form's, by their keys) write: their values and own columns, each
   * checked (an entity one names, as `view` reads it), refused when one its form requires is missing or a value is one
   * its field doesn't take.
   */
  protected abstract planNewFields(view: RulesetView, fields: FieldsRequest): FieldsPlan;

  /**
   * Where an inventory entry's add or edit (`change`) holds its item and what it holds of it: its location (none to
   * carry it), its groups (3.5's weapon sets, in a hand), and its charges, which only an item that comes with them
   * keeps. Refused when the item can't be equipped where it's asked to be, its requirements checked unless `force`d.
   */
  protected abstract planPlacement(
    view: RulesetView,
    character: CharacterInput,
    change: PlacementChange,
    force: boolean,
  ): Omit<InventoryEntryPlan, "itemId">;

  /**
   * Why a placement (`query`: its location, in its groups: 3.5's weapon sets, for a hand) can't take one more item of
   * the character's, if it can't: the entry in the way, the entry placed (none for a new one) aside. What the inventory
   * dialogs warn of, and an add refuses.
   */
  abstract describePlacement(view: RulesetView, character: CharacterInput, query: PlacementQuery): PlacementDescription;

  /**
   * A role of the module's characters' links it holds many of (`role`), scored (with an amount) or picked, and its
   * entities' kind: refused as not found for any other.
   */
  private roleOf(role: string, scored: boolean) {
    const declared = this.storage.registries.characterRoles.find((def) => def.role === role && !def.single);
    if (!declared || this.storage.character.scoredRoles.includes(role) !== scored)
      throw new RulesError("not-found", `No ${scored ? "scored" : "picked"} link ${role}`);
    return { kind: declared.entityType as keyof ViewKinds, role };
  }

  /** The scored roles the module stores of its characters, each with its entities' kind. */
  private scoredRoles() {
    return this.storage.character.scoredRoles.map((role) => this.roleOf(role, true));
  }

  /** The single roles of the module's characters' links (3.5's race): what a new character's creation picks. */
  private singleRoles() {
    return this.storage.registries.characterRoles.filter((def) => def.single);
  }

  /**
   * A character's sheet as the API answers it (`DescribedSheet`): its row's columns (`CharacterColumns`, no share token
   * among them), then its ruleset's sheet's declared keys (`describeFull`, a `RulesetSheet`): a character's, its
   * children (`children`) among its blocks, or a child's, from its parent's; its private notes shown or left out
   * (`notes`). The ruleset describes rows without its share token, and without its private notes for a viewer who
   * doesn't read them, whose sheet's `fields` blocks hold none (`NotedSheet`).
   */
  describe(
    view: RulesetView,
    character: CharacterInput,
    children: CharacterInput[],
    notes: PrivateNotes = "show",
  ): DescribedSheet<D["sheet"]> {
    const read = (input: CharacterInput) => CharactersPart.readAs(input, notes);
    const sheet = this.describeFull(view, read(character), children.map(read));
    const shown = notes === "show" ? sheet : CharactersPart.redactNotes(sheet);
    return { ...CharactersPart.columnsOf(view, character.record), ...CharactersPart.sheetOf(shown) };
  }

  /**
   * The card of a character (`character`, with its advancements, `advancements`), as a list of characters shows it: its
   * row's id, name and description, and its ruleset's chips (`describeFullCard`, from its row without its private
   * notes nor its share token), each its declared keys alone. A partly seen one's (`partial`) has no description, its
   * ruleset's chips described from its row without it, and those its ruleset marks as its partial reading's alone.
   */
  describeCard(
    view: RulesetView,
    character: CharacterRecord,
    advancements: StoredAdvancement[],
    partial: boolean,
  ): CharacterCard {
    // Its ruleset describes a row without notes nor share token, and a partly seen one's without its description
    const row = CharactersPart.rowAs(character, partial ? "partial" : "hide");
    const { chips } = this.describeFullCard(view, row, advancements);
    return CharactersPart.cardOf(character, chips, partial);
  }

  /**
   * How a new character's scores of a scored link's role (`role`) are set, as its form offers it (`describeScores`).
   * Refused as not found when the role is no scored link's of the character's.
   */
  describeCreation(view: RulesetView, role: string): ScoresCreation {
    return this.describeScores(view, this.roleOf(role, true).role);
  }

  /**
   * A character as a campaign member reads it (`reading`): its sheet, its private notes shown or left out, or partly
   * (`PartialSheet`), an allowlist built from its shapes' declared keys (`PartialSheets`): its row's columns, no
   * requirements, modifiers nor issues, and of what its ruleset describes of it from its rows without its private
   * notes, its share token, its description nor its children (`describePartial`), its summary with no tracks and its
   * identity's block alone, without its picked links nor its notes.
   */
  describeForMember(
    view: RulesetView,
    character: CharacterInput,
    children: CharacterInput[],
    reading: MemberReading,
  ): DescribedSheet<D["sheet"]> | PartialSheet {
    if (reading !== "partial") return this.describe(view, character, children, reading);
    const described = this.describePartial(view, CharactersPart.readAs(character, "partial"));
    return PartialSheets.describe(CharactersPart.columnsOf(view, character.record), described);
  }

  /**
   * The character's entries (`entries`, each naming its item), as its sheet lists them: each with what its ruleset
   * shows of it (`describeInventoryEntry`), and its item as the view composes it (`RulesetData.entriesWithItems`), its
   * fields as an item's answer carries them (`describeInventoryItemFields`), its template's of each it holds none of
   * among them (`RulesetData.withInheritedFields`), its modifiers, and its requirements, its template's before its own.
   */
  describeInventory<T extends HeldInventoryEntry & { itemId: string }>(
    view: RulesetView,
    entries: T[],
  ): DescribedInventoryEntry<T, D["inventoryEntry"]>[] {
    const { rulesetData } = view;
    return rulesetData.entriesWithItems(entries).map(({ entry, item: stored }) => {
      const item = rulesetData.withInheritedFields(stored.type, stored);
      const { own: requirements, template: proficiency } = rulesetData.templateRequirements(item.type, item);
      return {
        ...entry,
        ...this.describeInventoryEntry(entry, item),
        item: {
          ...item,
          fields: this.describeInventoryItemFields(item),
          modifiers: rulesetData.modifiersBySource.get(item.id) ?? [],
          requirements: [...proficiency, ...requirements],
        },
      };
    });
  }

  /**
   * What a character has of a picked link's role (`role`), and what its picks (`entityIds`, as an edit is being made)
   * leave it room for (`describeLinkRoom`), each by the id the view keys it by. Refused, naming it, when one isn't an
   * entity of the role's kind in the character's ruleset, or is sent twice.
   */
  describeLinkPicks(view: RulesetView, character: CharacterInput, role: string, entityIds: string[]): LinkRoom {
    const picks = CharactersPart.idsOf(view).resolveAll(this.roleOf(role, false).kind, entityIds);
    return this.describeLinkRoom(view, character, role, picks);
  }

  /**
   * A character's printed sheet: the document the server renders (`describeDocument`), from its rows as its reader
   * reads them, its private notes shown or left out (`notes`), and never its share token.
   */
  describeSheet(view: RulesetView, character: CharacterInput, request: SheetRequest, notes: PrivateNotes) {
    return this.describeDocument(view, CharactersPart.readAs(character, notes), request);
  }

  /**
   * The picker of a new character's creation pick (the single link of `role`, 3.5's race) of what its form says
   * (`query`): the entities it offers, each checked (`openPicker`), read as the entities of its role's kind
   * (`entityType`). Refused as not found when the role is no single link's of the character's.
   */
  openCreationPicker(view: RulesetView, role: string, query: CreationPickQuery) {
    const declared = this.singleRoles().find((def) => def.role === role);
    if (!declared) throw new RulesError("not-found", `No creation pick ${role}`);
    const picker = this.openPicker(view, role, query);
    return {
      describe: picker.describe.bind(picker),
      filters: { ...picker.filters, entityType: declared.entityType },
    };
  }

  /**
   * What a new character stores: what it starts with (`planStart`: its kind, its single links, and its scored links'
   * amounts), and its row's fields' values and own columns (`planNewFields`). Refused as its start is, or when a field
   * is.
   */
  planCreate(view: RulesetView, request: NewCharacterRequest): NewCharacterPlan {
    const { fields, ...start } = request;
    const { links, row } = this.planStart(view, start);
    const { fields: written, own } = this.planNewFields(view, fields);
    return { links, row: { ...own, ...row, fields: written } };
  }

  /**
   * What an edit of a character (`edit`) writes: its fields' values and own columns (`planFields`), each checked, and
   * each picked link's picks it sends, by role (`planLinkPicks`).
   */
  planEdit(view: RulesetView, character: CharacterInput, edit: CharacterEditRequest): CharacterEditPlan {
    const links = edit.links && Object.entries(edit.links);
    return {
      ...(edit.fields ? this.planFields(view, character, edit.fields) : { fields: {}, own: {} }),
      ...(links && {
        links: Object.fromEntries(
          links.map(([role, entityIds]) => [role, this.planLinkPicks(view, character, role, entityIds)]),
        ),
      }),
    };
  }

  /**
   * What an inventory entry's add or edit stores, checked: its item (an added one's, as the view has it), its placement
   * and its charges (`planPlacement`: the item equipped where asked, its requirements checked unless `force`d; charges
   * only for an item that comes with them). Refused
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
      "itemId" in change ? { item: CharactersPart.idsOf(view).findItem(change.itemId), request } : change;
    const placement = this.planPlacement(view, character, placed, force);
    CharactersPart.checkCharges(placement.totalCharges, placement.remainingCharges);
    return { ...placement, itemId: "item" in placed ? placed.item.id : placed.entry.itemId };
  }

  /**
   * The picks a character's picked link's edit (`role`, `entityIds`) stores, each by the id the view keys it by: those
   * it picked, past those its rules give it (`fitLinks`). Refused, naming it, when one isn't an entity of the role's
   * kind in the character's ruleset (unknown, of an unrelated ruleset, or deleted), is sent twice (by one id, or by its
   * source's and its copy's), or is a new pick past what the rules let the character have.
   */
  planLinkPicks(view: RulesetView, character: CharacterInput, role: string, entityIds: string[]): LinkPicksPlan {
    const picks = CharactersPart.idsOf(view).resolveAll(this.roleOf(role, false).kind, entityIds);
    return { entityIds: this.fitLinks(view, character, role, picks) };
  }

  /**
   * The amounts a character's scored link's edit (`role`, `scores`, by entity id) stores, each under the id the view
   * keys its entity by. Refused when an amount is past the role's bounds (`describeScores`), or names no entity of its
   * kind in the ruleset, or two name one.
   */
  planScores(view: RulesetView, role: string, scores: ScoresRequest): ScoresPlan {
    const { kind } = this.roleOf(role, true);
    RulesError.parse(CharactersPart.boundedScores(this.describeScores(view, role).scores), scores);
    const amounts = CharactersPart.idsOf(view).resolveKeys(kind, scores);
    return { links: [...amounts].map(([entityId, amount]) => ({ entityId, amount })) };
  }

  /**
   * What a new character starts with, as its form or its import gives it: its kind (its module's player character's,
   * `StoredCharacter.playerKind`), the entity of each of its single links (`picks`, by role: 3.5's race), and an amount
   * for each entity of each scored role's kind, the one given (`scores`, by role, then entity id) or the one an unset
   * entity starts at (`describeScores`), each by the id the view keys it by. Refused when an amount is past its role's
   * bounds, a pick or a scored entity isn't one of the ruleset's, two amounts name one entity, or a pick is one its
   * ruleset's rules refuse (`checkCreationPick`).
   */
  planStart(view: RulesetView, request: StartRequest): StartPlan {
    const scored = this.scoredRoles().map((scoredRole) => ({
      ...scoredRole,
      bounds: this.describeScores(view, scoredRole.role).scores,
    }));
    for (const { bounds, role } of scored)
      RulesError.parse(CharactersPart.boundedScores(bounds), request.scores[role] ?? {}, [role]);
    const ids = CharactersPart.idsOf(view);
    const singles: Record<string, string> = {};
    for (const { entityType, role } of this.singleRoles()) {
      const picked = request.picks[role];
      const kind = entityType as keyof ViewKinds;
      if (picked === undefined)
        throw new RulesError("invalid", `A new character's ${view.rulesetData.labelOf(kind)} is required`);
      const entity = ids.find(kind, picked);
      this.checkCreationPick(view, role, entity);
      singles[role] = (entity as { id: string }).id;
    }
    const scores = scored.map(({ bounds, kind, role }) => {
      const given = ids.resolveKeys(kind, request.scores[role] ?? {});
      const rows = view.rulesetData.rows(kind) as { id: string }[];
      return [role, rows.map(({ id }) => ({ entityId: id, amount: given.get(id) ?? bounds.start }))];
    });
    return { links: Object.fromEntries(scores), row: { kind: this.storage.character.playerKind, links: singles } };
  }
}
