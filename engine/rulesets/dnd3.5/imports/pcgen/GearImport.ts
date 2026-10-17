import type { ImportedGear, ImportReport } from "@/engine/core/imports/index.ts";
import type { CharacterInput, InventoryEntryPlan, InventoryEntryRequest } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import Dnd35Characters from "@/engine/rulesets/dnd3.5/characters/Dnd35Characters.ts";
import ItemPlacement, { type ItemPlacementDescription } from "@/engine/rulesets/dnd3.5/rules/ItemPlacement.ts";
import type { Item } from "@/shared/relations.ts";

import { PCGEN_LOCATIONS } from "./names.ts";
import type PcgenNames from "./PcgenNames.ts";

/** An inventory entry an import writes: its item, where it's held, its charges and how many. */
export type ImportedEntry = InventoryEntryPlan & { quantity: number };

/** An entry's request to carry its item, unequipped. */
const CARRIED = { equipped: false, location: null, weaponSets: [] };

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

  private readonly characters = new Dnd35Characters();

  /** The item a piece of gear is: by its name, or a plain custom item's by its base item's. */
  private findItem(gear: ImportedGear) {
    const found = this.names.findItem(gear.name);
    if (found || gear.magic || !gear.baseName) return found;
    return this.names.findItem(gear.baseName);
  }

  /**
   * Where the file wears an item, as the app holds it: a hand by the file's (both, for a weapon that takes two), a
   * place on the body by the item's own slot (`placement`, as the item is placed); carried where the file doesn't wear
   * it.
   */
  private placementOf(
    gear: ImportedGear,
    placement: ItemPlacementDescription,
  ): Pick<InventoryEntryRequest, "equipped" | "location" | "weaponSets"> {
    const mapped = gear.location === undefined ? undefined : PCGEN_LOCATIONS.get(gear.location);
    if (!mapped) return CARRIED;
    const offered = placement.locations.map(({ location }) => location);
    const wanted = mapped === "slot" ? placement.slot : mapped;
    const location = wanted && offered.includes(wanted) ? wanted : offered.length === 1 ? offered[0] : undefined;
    if (!location) return CARRIED;
    return { equipped: true, location, weaponSets: ItemPlacement.isHand(location) ? [0] : [] };
  }

  /**
   * The entry a piece of gear is, held where the file wears it, or carried when the character can't hold it there (a
   * slot taken, a requirement unmet): the report says which.
   */
  private planEntry(character: CharacterInput, gear: ImportedGear, item: Item): ImportedEntry {
    const described = ItemPlacement.describe(item, this.view.rulesetData.itemProperties(item));
    const placement = this.placementOf(gear, described);
    const { charges } = described;
    const request = { ...placement, remainingCharges: charges, totalCharges: charges };
    const quantity = Math.max(1, Math.round(gear.quantity));
    const plan = (asked: InventoryEntryRequest) =>
      this.characters.planInventoryEntry(this.view, character, { itemId: item.id, request: asked }, false);
    try {
      return { ...plan(request), quantity };
    } catch (error) {
      if (!(error instanceof RulesError) || !placement.equipped) throw error;
      this.report.issue(`${item.name}: carried, not in ${placement.location}: ${error.message}`);
      return { ...plan({ ...request, ...CARRIED }), quantity };
    }
  }

  /** The character's rows with an entry added, which the next entry's slot is checked against. */
  private withEntry(character: CharacterInput, entry: ImportedEntry): CharacterInput {
    const now = new Date().toISOString();
    const row = {
      ...entry,
      characterId: character.record.id,
      createdAt: now,
      deletedAt: null,
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
      const entry = this.planEntry(holder, piece, this.view.rulesetData.itemsById.get(item.id)!);
      entries.push(entry);
      holder = this.withEntry(holder, entry);
      const held = entry.location ? `, ${entry.location}` : "";
      this.report.import(`Item: ${item.name} ×${entry.quantity}${held}`);
    }
    return entries;
  }
}
