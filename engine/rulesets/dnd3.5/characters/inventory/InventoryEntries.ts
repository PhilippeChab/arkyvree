import { z } from "zod";

import type {
  CharacterInput,
  HeldInventoryEntry,
  InventoryEntryRequest,
  PlacementChange,
  PlacementDescription,
  PlacementQuery,
} from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import ItemPlacement from "@/engine/rulesets/dnd3.5/rules/ItemPlacement.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Item } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import { LOCATION_OPTIONS } from "@/vocabulary/dnd3.5/equipment.ts";

import Equipping from "./Equipping.ts";

/** A location a request names: one of 3.5's, refused as invalid otherwise. */
const LOCATION = z.enum(LOCATION_OPTIONS);

/**
 * A character's inventory: what an entry shows beside its row (where its item can go, where it's worn), what keeps a
 * location from taking an item, and where an entry's add or edit holds its item, checked.
 */
export default class InventoryEntries {
  /**
   * Where an entry is held, as it stores it: only an equipped item has a location, only a held one sets, each once, in
   * order.
   */
  private static placementOf({ equipped, groups, location }: InventoryEntryRequest): HeldInventoryEntry {
    const resolvedLocation = equipped ? (location ?? null) : null;
    const resolvedEquipped = !!resolvedLocation;
    const held = resolvedEquipped && ItemPlacement.isHand(resolvedLocation);
    return {
      equipped: resolvedEquipped,
      location: resolvedLocation,
      groups: held ? [...new Set(groups)].sort((a, b) => a - b) : [],
    };
  }

  /**
   * What an inventory entry shows beside its row: where its item can go (`placement`, its fields its template's of
   * those it holds none of among them), and where it's worn.
   */
  static describeInventoryEntry(entry: HeldInventoryEntry, item: Item) {
    return { placement: ItemPlacement.describe(item), slotLabel: ItemPlacement.describeSlot(entry) };
  }

  /**
   * Why `location` (in each of its `groups`, 3.5's weapon sets, stored from 0, for a hand) can't take one more item of
   * the character's, if it can't: the entry in the way, named with its set, the entry placed (`entryId`, none for a new
   * one) aside. Refused as invalid when the location isn't one of 3.5's.
   */
  static describePlacement(
    view: RulesetView,
    character: CharacterInput,
    { entryId, groups: weaponSets, location }: PlacementQuery,
  ): PlacementDescription {
    const at = RulesError.parse(LOCATION, location, ["location"]);
    return { warning: new Equipping(view, character).describeConflict(entryId, at, weaponSets) };
  }

  /**
   * Where an entry's add or edit holds its item, from the character's rows. Refused as invalid when the location it
   * names isn't one of 3.5's, equipped or not, and when the item can't be equipped where it's asked to be (`Equipping`:
   * an item already carried takes another entry, a second dagger held in the other hand; its requirements unless
   * `force`d).
   */
  static planPlacement(
    view: RulesetView,
    character: CharacterInput,
    change: PlacementChange,
    force: boolean,
  ): HeldInventoryEntry {
    const { request } = change;
    const { equipped, groups: weaponSets } = request;
    const location = RulesError.parse(LOCATION.nullable(), request.location, ["location"]);
    if (equipped && location) {
      const entry =
        "item" in change
          ? { id: null, item: change.item }
          : { id: change.entry.id, item: Dnd35View.of(view.rulesetData).itemsById.get(change.entry.itemId) };
      if (!entry.item) throw new RulesError("not-found", "Item not found");
      new Equipping(view, character).checkEquip({ id: entry.id, item: entry.item }, location, weaponSets, force);
    }
    return InventoryEntries.placementOf(request);
  }
}
