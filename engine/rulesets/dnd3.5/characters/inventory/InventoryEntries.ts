import type {
  CharacterInput,
  HeldInventoryEntry,
  PlacementChange,
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
  /**
   * Where an entry is held, as it stores it: only an equipped item has a location, only a held one sets, each once, in
   * order.
   */
  private static placementOf({ equipped, location, weaponSets }: HeldInventoryEntry): HeldInventoryEntry {
    const resolvedLocation = equipped ? (location ?? null) : null;
    const resolvedEquipped = !!resolvedLocation;
    const held = resolvedEquipped && ItemPlacement.isHand(resolvedLocation);
    return {
      equipped: resolvedEquipped,
      location: resolvedLocation,
      weaponSets: held ? [...new Set(weaponSets)].sort((a, b) => a - b) : [],
    };
  }

  /** What an inventory entry shows beside its row: where its item can go (`placement`), and where it's worn. */
  static describeInventoryEntry(entry: HeldInventoryEntry, item: Item, properties: Property[]) {
    return { placement: ItemPlacement.describe(item, properties), slotLabel: ItemPlacement.describeSlot(entry) };
  }

  /**
   * Why `location` (in each of `weaponSets`, stored from 0, for a hand) can't take one more item of the character's, if
   * it can't: the entry in the way, named with its set, the entry placed (`entryId`, none for a new one) aside.
   */
  static describePlacement(
    view: RulesetView,
    character: CharacterInput,
    { entryId, location, weaponSets }: PlacementQuery,
  ): PlacementDescription {
    return { warning: new Equipping(view, character).describeConflict(entryId, location, weaponSets) };
  }

  /**
   * Where an entry's add or edit holds its item, from the character's rows. Refused when the item can't be equipped
   * where it's asked to be (`Equipping`: an item already carried takes another entry, a second dagger held in the other
   * hand; its requirements and its one hand unless `force`d, or an edit keeps it where it's held, which met them or was
   * forced when it got there).
   */
  static planPlacement(
    view: RulesetView,
    character: CharacterInput,
    change: PlacementChange,
    force: boolean,
  ): HeldInventoryEntry {
    const { equipped, location } = change.request;
    const held = "entry" in change ? character.rows.inventory.find((row) => row.id === change.entry.id) : undefined;
    // An edited entry's sets as a hand reads them: the first, for one stored without
    const heldSets = held && ItemPlacement.isHand(held.location) ? ItemPlacement.heldSets(held) : undefined;
    // A hand holds what names no weapon set in those an edited entry is held in, else in the first, as an import does
    const inHand = (held?.equipped && heldSets) || [0];
    const weaponSets = change.request.weaponSets ?? (ItemPlacement.isHand(location) ? inHand : []);
    const placed = InventoryEntries.placementOf({ equipped, location, weaponSets });
    if (equipped && location) {
      const entry =
        "item" in change
          ? { id: null, item: change.item }
          : { id: change.entry.id, item: view.rulesetData.itemsById.get(change.entry.itemId) };
      if (!entry.item) throw new RulesError("not-found", "Item not found");
      const kept =
        !!held?.equipped &&
        held.location === location &&
        String(heldSets ?? held.weaponSets) === String(placed.weaponSets);
      new Equipping(view, character).checkEquip(
        { id: entry.id, item: entry.item },
        location,
        weaponSets,
        force || kept,
      );
    }
    return placed;
  }
}
