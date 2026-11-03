import type { ImportReport } from "@/engine/core/imports/index.ts";
import type {
  CharacterInput,
  HeldInventoryEntry,
  InventoryEntryPlan,
  InventoryEntryRequest,
} from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import Dnd35Characters from "@/engine/rulesets/dnd3.5/characters/Dnd35Characters.ts";
import Equipping from "@/engine/rulesets/dnd3.5/characters/inventory/Equipping.ts";
import type { ImportedGear } from "@/engine/rulesets/dnd3.5/imports/imported.ts";
import ItemPlacement, { type ItemPlacementDescription } from "@/engine/rulesets/dnd3.5/rules/ItemPlacement.ts";
import { DND35_STORAGE } from "@/engine/rulesets/dnd3.5/storage/Dnd35Storage.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Item } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import { MAX_ITEM_CHARGES, MAX_ITEM_QUANTITY } from "@/shared/characters.ts";
import type { ItemLocation } from "@/vocabulary/dnd3.5/equipment.ts";

import { PCGEN_LOCATIONS } from "./names.ts";
import type PcgenNames from "./PcgenNames.ts";

/** Where an entry holds its item, at one of 3.5's locations, none to carry it. */
interface Placement extends HeldInventoryEntry {
  location: ItemLocation | null;
}

/** An entry's request to carry its item, unequipped. */
const CARRIED: Placement = { groups: [], location: null };

/**
 * The gear a file holds, as inventory entries of the character with its levels: each item found in the ruleset by its
 * name (a plain custom item by its base item's too), held where the file wears it when the character can (its slot
 * free, its requirements met; carried otherwise, which the report says), as many as its place has room for and the
 * rest carried, with the charges the item comes with. Magic gear the ruleset has no item of is listed for the user to
 * make: the import makes nothing in their ruleset.
 */
export default class GearImport {
  constructor(
    private readonly view: RulesetView,
    private readonly names: PcgenNames,
    private readonly report: ImportReport,
  ) {}

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

  /** The charges an entry of an item holds: the item's, at most the most the app keeps, which the report says. */
  private keptChargesOf(charges: number | null, item: Item) {
    if (charges === null || charges <= MAX_ITEM_CHARGES) return charges;
    this.report.issue(`${item.name}'s ${charges} charges are past the most the app keeps: ${MAX_ITEM_CHARGES} kept`);
    return MAX_ITEM_CHARGES;
  }

  /**
   * Where the file wears an item, as the app holds it: a hand by the file's (both, for a weapon that takes two), a
   * place on the body by the item's own slot (`placement`, as the item is placed); carried where the file doesn't wear
   * it.
   */
  private placementOf(gear: ImportedGear, placement: ItemPlacementDescription): Placement {
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
   * The entries a piece of gear is: held where the file wears it, as many of it as the place has room for (`Equipping`'s
   * room: the fingers' rings, one at a place that holds one, any number where an item of no slot goes), the rest
   * carried; or all of it carried when the character can't hold it there (a slot taken, a requirement unmet), which the
   * report says.
   */
  private planEntries(character: CharacterInput, gear: ImportedGear, item: Item): InventoryEntryPlan[] {
    const described = ItemPlacement.describe(this.view.rulesetData.withInheritedFields("items", item));
    const placement = this.placementOf(gear, described);
    const charges = this.keptChargesOf(described.charges, item);
    // The charges the file says are left, within those the item comes with
    const left = charges !== null && gear.charges !== undefined ? Math.min(gear.charges, charges) : charges;
    const quantity = this.quantityOf(gear, item);
    const request = { ...placement, quantity, remainingCharges: left, totalCharges: charges };
    const carried = { ...request, ...CARRIED };
    const plan = (asked: InventoryEntryRequest) =>
      this.characters.planInventoryEntry(this.view, character, { itemId: item.id, request: asked }, false);
    const { groups, location } = placement;
    if (location === null) return [plan(request)];
    // One at least, which a place with no room refuses, its entry in the way named
    const worn = Math.max(1, Math.min(quantity, new Equipping(this.view, character).countRoom(null, location, groups)));
    const rest = worn < quantity ? [plan({ ...carried, quantity: quantity - worn })] : [];
    try {
      return [plan({ ...request, quantity: worn }), ...rest];
    } catch (error) {
      if (!(error instanceof RulesError)) throw error;
      this.report.issue(`${item.name}: carried, not in ${location}: ${error.message}`);
      return [plan(carried)];
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
  private withEntry(character: CharacterInput, entry: InventoryEntryPlan): CharacterInput {
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
  planInventory(character: CharacterInput, gear: ImportedGear[]): InventoryEntryPlan[] {
    const entries: InventoryEntryPlan[] = [];
    // The carried entries by item and charges left: two pieces of one item carried (one owned without being carried,
    // a pair's third dagger, what its place had no room for) are one entry
    const carried = new Map<string, InventoryEntryPlan>();
    let holder = character;
    for (const piece of gear) {
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
      const found = Dnd35View.of(this.view.rulesetData).itemsById.get(item.id)!;
      for (const entry of this.planEntries(holder, piece, found)) {
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
    }
    return entries;
  }
}
