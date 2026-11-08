import { z } from "zod";

import type {
  CharacterInput,
  HeldInventoryEntry,
  InventoryEntryPlan,
  InventoryEntryRequest,
  PlacementChange,
  PlacementDescription,
  PlacementQuery,
} from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import ItemPlacement from "@/engine/rulesets/dnd5/rules/ItemPlacement.ts";
import Dnd5View from "@/engine/rulesets/dnd5/view/Dnd5View.ts";
import type { Item } from "@/engine/rulesets/dnd5/view/rows.ts";
import { LOCATION_OPTIONS } from "@/vocabulary/dnd5/equipment.ts";

import Equipping from "./Equipping.ts";

/** A location a request names: one of the 2024 rules', refused as invalid otherwise. */
const LOCATION = z.enum(LOCATION_OPTIONS);

/**
 * A character's inventory: what an entry shows beside its row (where its item can go, where it's worn), what keeps a
 * location from taking an item, and where an entry's add or edit holds its item, checked.
 */
export default class InventoryEntries {
  /**
   * Where an entry is held, as it stores it: its location, none for an item carried, and its weapon sets, which only a
   * held one sets, each once, in order.
   */
  private static placementOf({ groups, location }: InventoryEntryRequest): HeldInventoryEntry {
    const held = location !== null && ItemPlacement.isHand(location);
    return { location, groups: held ? [...new Set(groups)].sort((a, b) => a - b) : [] };
  }

  /**
   * What an inventory entry shows beside its row: where its item can go (`placement`, its fields its template's of
   * those it holds none of among them), and where it's worn.
   */
  static describeInventoryEntry(entry: HeldInventoryEntry, item: Item) {
    return { placement: ItemPlacement.describe(item), slotLabel: ItemPlacement.describeSlot(entry) };
  }

  /**
   * Why `location` (in each of its `groups`, the character's weapon sets, stored from 0, for a hand) can't take one more item of
   * the character's, if it can't: the entry in the way, named with its set, the entry placed (`entryId`, none for a new
   * one) aside. Refused as invalid when the location isn't one of the 2024 rules'.
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
   * Where an entry's add or edit holds its item, from the character's rows: its location, none to carry it, how many
   * of it (any number carried; held somewhere, as many as the place has room for), and its charges, which only an item
   * that comes with them keeps (`ItemPlacement`'s, its template's field among its own). Refused as invalid when the
   * location isn't one of the 2024 rules', and when the item can't be equipped there, or not that many of it (`Equipping`: an
   * item already carried takes another entry, a second dagger held in the other hand; its requirements unless
   * `force`d). A new entry's item is the ruleset's, as its ruleset's view holds it.
   */
  static planPlacement(
    view: RulesetView,
    character: CharacterInput,
    change: PlacementChange<Item>,
    force: boolean,
  ): Omit<InventoryEntryPlan, "itemId"> {
    const { request } = change;
    const { groups: weaponSets, quantity } = request;
    const location = RulesError.parse(LOCATION.nullable(), request.location, ["location"]);
    const entry =
      "item" in change
        ? { id: null, item: change.item }
        : { id: change.entry.id, item: Dnd5View.of(view.rulesetData).itemsById.get(change.entry.itemId) };
    if (!entry.item) throw view.rulesetData.notFound("items");
    const equipped = { id: entry.id, item: entry.item, quantity };
    if (location) new Equipping(view, character).checkEquip(equipped, location, weaponSets, force);
    const { charges } = ItemPlacement.describe(view.rulesetData.withInheritedFields("items", entry.item));
    return {
      ...InventoryEntries.placementOf(request),
      quantity,
      totalCharges: charges === null ? null : (request.totalCharges ?? null),
      remainingCharges: charges === null ? null : (request.remainingCharges ?? null),
    };
  }
}
