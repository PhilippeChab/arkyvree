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
  CharacterCard,
  DescribedInventoryEntry,
  HeldInventoryEntry,
  LinkRoom,
  NotedSheet,
  PlacementDescription,
  ScoreBounds,
  ScoresCreation,
} from "./descriptions.ts";
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
 * one, a creation pick), its inventory. So
 * are the checks that guard a character's privacy and integrity, which no ruleset can skip: a reader reads the private
 * notes the reading gives them, a partly seen character's card and summary name none of its build, an entity a request
 * names is one its ruleset's view shows (a pick's, a link's, an item: `RequestIds`, which reads a source's id as its
 * copy's), an entry's charges agree, and a score is within its link's bounds. Their operations are this part's, over
 * hooks for what a ruleset describes or checks its own way (`describeFull`, `describePartial`, `describeFullCard`,
 * `planPlacement`, a scored link's creation, `describeScores`, a creation pick's own check and picker,
 * `checkCreationPick` and `openPicker`, and a picked link's room and fit: `describeLinkRoom`, `fitLinks`).
 */
export default abstract class CharactersPart<D extends Descriptions> {
  /** The module's storage, whose character's roles name the kinds this part's requests name. */
  constructor(private readonly storage: StorageDeclaration) {}

  /**
   * The card of a character whose ruleset a list didn't read (an archived ruleset's), which no ruleset describes: a chip
   * saying it's unknown alone, which a partly seen character shows too.
   */
  static readonly UNREAD_CARD: CharacterCard = { chips: [{ label: "Unknown", partial: true, tone: "secondary" }] };

  /** An amount of a scored link's, by entity id: each a whole number within its bounds. */
  private static boundedScores({ max, min }: ScoreBounds) {
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
   * A character's rows without its private notes, nor its parent's: what a reader who doesn't read them is described
   * from, so no ruleset's description can show them.
   */
  private static withoutNotes(input: CharacterInput): CharacterInput {
    return {
      ...input,
      ...(input.parent && { parent: CharactersPart.withoutNotes(input.parent) }),
      record: { ...input.record, privateNotes: null },
    };
  }

  /**
   * Refuses a creation pick (`entity`, the one a new character's single link of `role` names) a ruleset's rules don't
   * let a new character make (3.5's race of a kind that isn't a player character's).
   */
  protected abstract checkCreationPick(role: string, entity: unknown): void;

  /**
   * A character's sheet as the API answers it (`NotedSheet`), its private notes as its rows have them (none when its
   * reader doesn't read them): a character's, its children (`children`) as its blocks show them; or a child's, from its
   * parent's (`parent`).
   */
  protected abstract describeFull(view: RulesetView, character: CharacterInput, children: CharacterInput[]): D["sheet"];

  /**
   * The card of a character (`character`, with its advancements, `advancements`), as a list of characters shows it to
   * a reader who sees all of it, named as its ruleset's view names what it shows, a copied or renamed one by its own
   * name.
   */
  protected abstract describeFullCard(
    view: RulesetView,
    character: CharacterRecord,
    advancements: StoredAdvancement[],
  ): CharacterCard;

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
   * What a campaign member who reads a character partly reads of it (`character`, its rows without its private notes):
   * who it is and what it looks like, without its children.
   */
  protected abstract describePartial(view: RulesetView, character: CharacterInput): D["partialSheet"];

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
   * Where an inventory entry's add or edit (`change`) holds its item: whether it's equipped, where, and its groups
   * (3.5's weapon sets, in a hand). Refused when the item can't be equipped where it's asked to be, its requirements
   * checked unless `force`d.
   */
  protected abstract planPlacement(
    view: RulesetView,
    character: CharacterInput,
    change: PlacementChange,
    force: boolean,
  ): HeldInventoryEntry;

  /**
   * Why a placement (`query`: its location, in its groups: 3.5's weapon sets, for a hand) can't take one more item of
   * the character's, if it can't: the entry in the way, the entry placed (none for a new one) aside. What the inventory
   * dialogs warn of, and an add refuses.
   */
  abstract describePlacement(view: RulesetView, character: CharacterInput, query: PlacementQuery): PlacementDescription;

  /** A character's printed sheet: the document the server renders. */
  abstract describeSheet(view: RulesetView, character: CharacterInput, request: SheetRequest): D["sheetDocument"];

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
   * A character's sheet as the API answers it (`describeFull`): a character's, its children (`children`) among its
   * blocks, or a child's, from its parent's; its private notes shown or left out (`notes`). A viewer who doesn't read
   * them reads none: the ruleset describes rows without them, and the sheet's `fields` blocks hold none (`NotedSheet`).
   */
  describe(
    view: RulesetView,
    character: CharacterInput,
    children: CharacterInput[],
    notes: PrivateNotes = "show",
  ): D["sheet"] {
    if (notes === "show") return this.describeFull(view, character, children);
    const withoutNotes = children.map((input) => CharactersPart.withoutNotes(input));
    const sheet = this.describeFull(view, CharactersPart.withoutNotes(character), withoutNotes);
    return CharactersPart.redactNotes(sheet);
  }

  /**
   * The card of a character (`character`, with its advancements, `advancements`), as a list of characters shows it: a
   * partly seen one's (`partial`) holds the chips its ruleset marks as its partial reading's alone.
   */
  describeCard(
    view: RulesetView,
    character: CharacterRecord,
    advancements: StoredAdvancement[],
    partial: boolean,
  ): CharacterCard {
    const card = this.describeFullCard(view, character, advancements);
    if (!partial) return card;
    return { chips: card.chips.filter((chip) => chip.partial) };
  }

  /**
   * How a new character's scores of a scored link's role (`role`) are set, as its form offers it (`describeScores`).
   * Refused as not found when the role is no scored link's of the character's.
   */
  describeCreation(view: RulesetView, role: string): ScoresCreation {
    return this.describeScores(view, this.roleOf(role, true).role);
  }

  /**
   * A character as a campaign member reads it (`reading`): partly, from its rows without its private notes nor its
   * children (`describePartial`), its summary with no tracks, or its sheet, its private notes shown or left out.
   */
  describeForMember(
    view: RulesetView,
    character: CharacterInput,
    children: CharacterInput[],
    reading: MemberReading,
  ): D["partialSheet"] | D["sheet"] {
    if (reading === "partial") {
      const sheet = this.describePartial(view, CharactersPart.withoutNotes(character));
      return { ...sheet, summary: { ...sheet.summary, tracks: [] } };
    }
    return this.describe(view, character, children, reading);
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
   * What a new character stores: what it starts with (`planStart`: its single links, and its scored links' amounts),
   * and its row's kind (its module's player character's, `StoredCharacter.playerKind`), fields' values and own columns
   * (`planNewFields`). Refused as its start is, or when a field is.
   */
  planCreate(view: RulesetView, request: NewCharacterRequest): NewCharacterPlan {
    const { fields, ...start } = request;
    const { links, row } = this.planStart(view, start);
    const { fields: written, own } = this.planNewFields(view, fields);
    return { links, row: { ...own, ...row, fields: written, kind: this.storage.character.playerKind } };
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
      "itemId" in change ? { item: CharactersPart.idsOf(view).findItem(change.itemId), request } : change;
    CharactersPart.checkCharges(request.totalCharges, request.remainingCharges);
    return {
      ...this.planPlacement(view, character, placed, force),
      itemId: "item" in placed ? placed.item.id : placed.entry.itemId,
      totalCharges: request.totalCharges ?? null,
      remainingCharges: request.remainingCharges ?? null,
    };
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
   * What a new character starts with, as its form or its import gives it: the entity of each of its single links
   * (`picks`, by role: 3.5's race), and an amount for each entity of each scored role's kind, the one given (`scores`,
   * by role, then entity id) or the one an unset entity starts at (`describeScores`), each by the id the view keys it
   * by. Refused when an amount is past its role's bounds, a pick or a scored entity isn't one of the ruleset's, two
   * amounts name one entity, or a pick is one its ruleset's rules refuse (`checkCreationPick`).
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
      this.checkCreationPick(role, entity);
      singles[role] = (entity as { id: string }).id;
    }
    const scores = scored.map(({ bounds, kind, role }) => {
      const given = ids.resolveKeys(kind, request.scores[role] ?? {});
      const rows = view.rulesetData.rows(kind) as { id: string }[];
      return [role, rows.map(({ id }) => ({ entityId: id, amount: given.get(id) ?? bounds.start }))];
    });
    return { links: Object.fromEntries(scores), row: { links: singles } };
  }
}
