import {
  type CharacterInput,
  CharactersPart,
  type HeldInventoryEntry,
  type InventoryEntryChange,
  type InventoryEntryPlan,
  type InventoryEntryRequest,
  type PlacementDescription,
  type PlacementQuery,
} from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import ItemPlacement from "@/engine/rulesets/dnd3.5/rules/ItemPlacement.ts";
import type { Item, Property } from "@/shared/relations.ts";

import Equipping from "./Equipping.ts";

/**
 * A character's inventory: what an entry shows beside its row (where its item can go, where it's worn), what keeps a
 * location from taking an item, and what an entry's add or edit stores, checked.
 */
export default class InventoryEntries {
  /** An entry's charges: both set or both null, and no more remaining than total. */
  private static checkCharges(totalCharges: number | null, remainingCharges: number | null) {
    if ((totalCharges === null) !== (remainingCharges === null))
      throw new RulesError("invalid", "Total charges and remaining charges must both be set or both be null");

    if (totalCharges !== null && remainingCharges !== null && remainingCharges > totalCharges)
      throw new RulesError("invalid", "Remaining charges cannot exceed total charges");
  }

  /** An entry's stored placement and charges: only an equipped item has a location, only a held one a set. */
  private static entryFields({
    equipped,
    location,
    remainingCharges,
    totalCharges,
    weaponSet,
  }: InventoryEntryRequest): InventoryEntryPlan {
    const resolvedLocation = equipped ? (location ?? null) : null;
    const resolvedEquipped = !!resolvedLocation;
    return {
      equipped: resolvedEquipped,
      location: resolvedLocation,
      weaponSet: resolvedEquipped && ItemPlacement.isHand(resolvedLocation) ? weaponSet : null,
      totalCharges: totalCharges ?? null,
      remainingCharges: remainingCharges ?? null,
    };
  }

  /** What an inventory entry shows beside its row: where its item can go (`placement`), and where it's worn. */
  static describeInventoryEntry(entry: HeldInventoryEntry, item: Item, properties: Property[]) {
    return { placement: ItemPlacement.describe(item, properties), slotLabel: ItemPlacement.describeSlot(entry) };
  }

  /**
   * Why `location` (in `weaponSet`, stored from 0, for a hand) can't take one more item of the character's, if it
   * can't: the entry in the way, named, the entry placed (`entryId`, none for a new one) aside.
   */
  static describePlacement(
    view: RulesetView,
    character: CharacterInput,
    { entryId, location, weaponSet }: PlacementQuery,
  ): PlacementDescription {
    return { warning: new Equipping(view, character).describeConflict(entryId, location, weaponSet) };
  }

  /**
   * What an entry's add or edit stores, from the character's rows: its placement and charges. Refused when an added
   * item isn't the character's ruleset's (nor from its source chain), the charges disagree, or the item can't be
   * equipped where it's asked to be (`Equipping`: an item already carried takes another entry, a second dagger held in
   * the other hand; its requirements unless `force`d).
   */
  static planInventoryEntry(
    view: RulesetView,
    character: CharacterInput,
    change: InventoryEntryChange,
    force: boolean,
  ): InventoryEntryPlan {
    const { rulesetData } = view;
    const { request } = change;
    if ("item" in change)
      CharactersPart.checkFromRuleset(view, [change.item], "Item does not belong to the character's ruleset");
    InventoryEntries.checkCharges(request.totalCharges, request.remainingCharges);

    const { equipped, location, weaponSet } = request;
    if (equipped && location) {
      const entry =
        "item" in change
          ? { id: null, item: change.item }
          : { id: change.entry.id, item: rulesetData.itemsById.get(change.entry.itemId) };
      if (!entry.item) throw new RulesError("not-found", "Item not found");
      new Equipping(view, character).checkEquip({ id: entry.id, item: entry.item }, location, weaponSet, force);
    }
    return InventoryEntries.entryFields(request);
  }
}
