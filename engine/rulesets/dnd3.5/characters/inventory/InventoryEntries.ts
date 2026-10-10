import type {
  CharacterInput,
  HeldInventoryEntry,
  InventoryEntryChange,
  InventoryEntryRequest,
  PlacementDescription,
  PlacementQuery,
} from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import ItemPlacement from "@/engine/rulesets/dnd3.5/rules/ItemPlacement.ts";
import type { Item, Property } from "@/shared/relations.ts";

import Equipping from "./Equipping.ts";

/**
 * A character's inventory: what an entry shows beside its row (where its item can go, where it's worn), what keeps a
 * location from taking an item, and where an entry's add or edit holds its item, checked.
 */
export default class InventoryEntries {
  /** Where an entry is held, as it stores it: only an equipped item has a location, only a held one a set. */
  private static placementOf({ equipped, location, weaponSet }: InventoryEntryRequest): HeldInventoryEntry {
    const resolvedLocation = equipped ? (location ?? null) : null;
    const resolvedEquipped = !!resolvedLocation;
    return {
      equipped: resolvedEquipped,
      location: resolvedLocation,
      weaponSet: resolvedEquipped && ItemPlacement.isHand(resolvedLocation) ? weaponSet : null,
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
   * Where an entry's add or edit holds its item, from the character's rows. Refused when the item can't be equipped
   * where it's asked to be (`Equipping`: an item already carried takes another entry, a second dagger held in the other
   * hand; its requirements unless `force`d).
   */
  static planPlacement(
    view: RulesetView,
    character: CharacterInput,
    change: InventoryEntryChange,
    force: boolean,
  ): HeldInventoryEntry {
    const { request } = change;
    const { equipped, location, weaponSet } = request;
    if (equipped && location) {
      const entry =
        "item" in change
          ? { id: null, item: change.item }
          : { id: change.entry.id, item: view.rulesetData.itemsById.get(change.entry.itemId) };
      if (!entry.item) throw new RulesError("not-found", "Item not found");
      new Equipping(view, character).checkEquip({ id: entry.id, item: entry.item }, location, weaponSet, force);
    }
    return InventoryEntries.placementOf(request);
  }
}
