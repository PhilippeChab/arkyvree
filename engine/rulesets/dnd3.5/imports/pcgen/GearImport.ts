import type { ImportReport } from "@/engine/core/imports/index.ts";
import type { CharacterInput, InventoryEntryPlan, InventoryEntryRequest } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import Dnd35Characters from "@/engine/rulesets/dnd3.5/characters/Dnd35Characters.ts";
import type { ImportedGear } from "@/engine/rulesets/dnd3.5/imports/imported.ts";
import ItemPlacement, { type ItemPlacementDescription } from "@/engine/rulesets/dnd3.5/rules/ItemPlacement.ts";
import { DND35_STORAGE } from "@/engine/rulesets/dnd3.5/storage/Dnd35Storage.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Item } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import { MAX_ITEM_QUANTITY } from "@/shared/characters.ts";
import { MAX_FINGER_ITEMS } from "@/vocabulary/dnd3.5/equipment.ts";

import { PCGEN_LOCATIONS } from "./names.ts";
import type PcgenNames from "./PcgenNames.ts";

/** An inventory entry an import writes: its item, where it's held, its charges and how many. */
export type ImportedEntry = InventoryEntryPlan & { quantity: number };

/** An entry's request to carry its item, unequipped. */
const CARRIED = { groups: [], location: null };

/**
 * The gear a file holds, as inventory entries of the character with its levels: each item found in the ruleset by its
 * name (a plain custom item by its base item's too), held where the file wears it when the character can (its slot
 * free, its requirements met; carried otherwise, which the report says), with the charges the item comes with. Magic
 * gear the ruleset has no item of is listed for the user to make: the import makes nothing in their ruleset.
 */
export default class GearImport {
  constructor(
    private readonly view: RulesetView,
    private readonly names: PcgenNames,
    private readonly report: ImportReport,
  ) {}

  /**
   * A worn piece as the entries that wear it: two of one ring (PCGen's `Fingers` counts them as one entry) a finger
   * each, as many as a character wears (`MAX_FINGER_ITEMS`), one of anything else at its place; the rest carried.
   */
  private static unitsOf(gear: ImportedGear): ImportedGear[] {
    const { location, ...carried } = gear;
    if (location === undefined || gear.quantity <= 1) return [gear];
    const worn = Math.min(Math.floor(gear.quantity), location === "Fingers" ? MAX_FINGER_ITEMS : 1);
    const rest = gear.quantity - worn;
    return [
      ...Array.from({ length: worn }, () => ({ ...gear, quantity: 1 })),
      ...(rest > 0 ? [{ ...carried, quantity: rest }] : []),
    ];
  }

  private readonly characters = new Dnd35Characters(DND35_STORAGE);

  /**
   * The item a piece of gear is: by its name, or a plain custom item's by its base item's, which the report says (what
   * it's made of, its quality, aren't the base item's: a masterwork longsword is a longsword).
   */
  private findItem(gear: ImportedGear) {
    const found = this.names.findItem(gear.name);
    if (found || gear.magic || !gear.baseName) return found;
    const base = this.names.findItem(gear.baseName);
    if (base) this.report.issue(`${gear.name}: imported as ${base.name}, its base item: what sets it apart isn't`);
    return base;
  }

  /**
   * Where the file wears an item, as the app holds it: a hand by the file's (both, for a weapon that takes two), a
   * place on the body by the item's own slot (`placement`, as the item is placed); carried where the file doesn't wear
   * it.
   */
  private placementOf(
    gear: ImportedGear,
    placement: ItemPlacementDescription,
  ): Pick<InventoryEntryRequest, "groups" | "location"> {
    if (gear.location === undefined) return CARRIED;
    const mapped = PCGEN_LOCATIONS.get(gear.location);
    const offered = placement.locations.map(({ location }) => location);
    const wanted = mapped === "slot" ? placement.slot : mapped;
    const location = wanted && offered.includes(wanted) ? wanted : offered.length === 1 ? offered[0] : undefined;
    if (!mapped || !location) {
      this.report.issue(
        `${gear.name}: worn at PCGen's ${gear.location}, which the app has no place for it at: carried`,
      );
      return CARRIED;
    }
    return { groups: ItemPlacement.isHand(location) ? [0] : [], location };
  }

  /**
   * The entry a piece of gear is, held where the file wears it, or carried when the character can't hold it there (a
   * slot taken, a requirement unmet): the report says which.
   */
  private planEntry(character: CharacterInput, gear: ImportedGear, item: Item): ImportedEntry {
    const described = ItemPlacement.describe(this.view.rulesetData.withInheritedFields("items", item));
    const placement = this.placementOf(gear, described);
    const { charges } = described;
    // The charges the file says are left, within those the item comes with
    const left = charges !== null && gear.charges !== undefined ? Math.min(gear.charges, charges) : charges;
    const request = { ...placement, remainingCharges: left, totalCharges: charges };
    const quantity = this.quantityOf(gear, item);
    const plan = (asked: InventoryEntryRequest) =>
      this.characters.planInventoryEntry(this.view, character, { itemId: item.id, request: asked }, false);
    try {
      return { ...plan(request), quantity };
    } catch (error) {
      if (!(error instanceof RulesError) || placement.location === null) throw error;
      this.report.issue(`${item.name}: carried, not in ${placement.location}: ${error.message}`);
      return { ...plan({ ...request, ...CARRIED }), quantity };
    }
  }

  /**
   * How many of an item the entry holds: the file's, whole, at least one and at most the largest the app keeps, which
   * the report says; and that the file's character doesn't carry it, when it doesn't (the app's inventory is carried).
   */
  private quantityOf(gear: ImportedGear, item: Item) {
    const whole = Math.max(1, Math.round(gear.quantity));
    const quantity = Math.min(whole, MAX_ITEM_QUANTITY);
    if (quantity < whole) this.report.issue(`${item.name} ×${whole} is past the most the app keeps: ${quantity} kept`);
    if (gear.notCarried) this.report.issue(`${item.name} ×${quantity}: not carried in PCGen, carried here`);
    return quantity;
  }

  /** The character's rows with an entry added, which the next entry's slot is checked against. */
  private withEntry(character: CharacterInput, entry: ImportedEntry): CharacterInput {
    const now = new Date().toISOString();
    const row = {
      ...entry,
      characterId: character.record.id,
      createdAt: now,
      id: crypto.randomUUID(),
      updatedAt: now,
    };
    return { ...character, rows: { ...character.rows, inventory: [...character.rows.inventory, row] } };
  }

  /**
   * The inventory entries the gear makes, for the character with its levels (`character`), one at a time: each found,
   * held, and said in the report; what the ruleset has no item of listed with why.
   */
  planInventory(character: CharacterInput, gear: ImportedGear[]): ImportedEntry[] {
    const entries: ImportedEntry[] = [];
    // The carried entries by item and charges left: two pieces of one item carried (one owned without being carried,
    // a pair's third dagger) are one entry
    const carried = new Map<string, ImportedEntry>();
    let holder = character;
    for (const piece of gear.flatMap((worn) => GearImport.unitsOf(worn))) {
      const item = this.findItem(piece);
      if (!item) {
        const made = piece.baseName ? ` (from ${piece.baseName})` : "";
        this.report.skip(
          piece.line,
          piece.magic
            ? `${piece.name} is magic gear the ruleset has no item of: make it in the ruleset${made}, then add it`
            : `${piece.name} isn't an item of the ruleset`,
        );
        continue;
      }
      const entry = this.planEntry(holder, piece, Dnd35View.of(this.view.rulesetData).itemsById.get(item.id)!);
      const held = entry.location ? `, ${entry.location}` : "";
      this.report.import(`Item: ${item.name} ×${entry.quantity}${held}`);
      const key = `${entry.itemId}:${entry.remainingCharges ?? ""}`;
      const same = entry.location !== null ? undefined : carried.get(key);
      if (same) {
        const total = same.quantity + entry.quantity;
        same.quantity = Math.min(MAX_ITEM_QUANTITY, total);
        if (same.quantity < total)
          this.report.issue(`${item.name} ×${total} is past the most the app keeps: ${same.quantity} kept`);
        continue;
      }
      if (entry.location === null) carried.set(key, entry);
      entries.push(entry);
      holder = this.withEntry(holder, entry);
    }
    return entries;
  }
}
