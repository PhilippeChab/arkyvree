import type { CharacterInput } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/types.ts";
import type { ItemLocation } from "@/shared/enums.ts";
import { isHandLocation } from "@/shared/equipment.ts";
import type { Item } from "@/shared/relations.ts";

import Equipping from "./Equipping.ts";

/** An entry's add, of the item the server read, or an edit of an entry the character has, of its item. */
export type EntryChange =
  | { item: Item; request: EntryRequest }
  | { entry: { id: string; itemId: string }; request: EntryRequest };

/** What an inventory entry's add or edit asks: where its item is held, its charges, and whether to force the rules. */
export interface EntryRequest {
  equipped: boolean;
  force: boolean;
  location: ItemLocation | null;
  remainingCharges: number | null;
  totalCharges: number | null;
  weaponSet: number | null;
}

/** A character's inventory: its entries as its sheet lists them, and what an entry's add or edit stores. */
export default class InventoryEntries {
  /** An entry's charges: both set or both null, and no more remaining than total. */
  private static checkCharges(totalCharges: number | null, remainingCharges: number | null) {
    if ((totalCharges === null) !== (remainingCharges === null))
      throw new RulesError("invalid", "Total charges and remaining charges must both be set or both be null");

    if (totalCharges !== null && remainingCharges !== null && remainingCharges > totalCharges)
      throw new RulesError("invalid", "Remaining charges cannot exceed total charges");
  }

  /** An entry's stored placement and charges: only an equipped item has a location, only a held one a set. */
  private static entryFields({ equipped, location, remainingCharges, totalCharges, weaponSet }: EntryRequest) {
    const resolvedLocation = equipped ? (location ?? null) : null;
    const resolvedEquipped = !!resolvedLocation;
    return {
      equipped: resolvedEquipped,
      location: resolvedLocation,
      weaponSet: resolvedEquipped && isHandLocation(resolvedLocation) ? weaponSet : null,
      totalCharges: totalCharges ?? null,
      remainingCharges: remainingCharges ?? null,
    };
  }

  /**
   * The character's entries (`entries`, each with the item row it names), as its sheet lists them: each with its item
   * as the view composes it (the stored row's copy or winner, the row itself without one), its properties, its
   * modifiers, and its requirements, its template's before its own.
   */
  static describe<T extends { itemId: string; itemsInRule: Item }>(view: RulesetView, entries: T[]) {
    const { rulesetData } = view;
    return entries.map((entry) => {
      // The join still contains the stored parent row after itemId resolves.
      const item = rulesetData.itemsById.get(entry.itemId) ?? entry.itemsInRule;
      const ownRequirements = rulesetData.requirementsByEntity.get(item.id) ?? [];
      const templateRequirements = item.sourceItemId
        ? (rulesetData.requirementsByEntity.get(item.sourceItemId) ?? [])
        : [];
      return {
        ...entry,
        item: {
          ...item,
          properties: rulesetData.itemProperties(item),
          modifiers: rulesetData.modifiersBySource.get(item.id) ?? [],
          requirements: [...templateRequirements, ...ownRequirements],
        },
      };
    });
  }

  /**
   * What an entry's add or edit stores, from the character's rows: its placement and charges. Refused when an added
   * item isn't the character's ruleset's (nor from its source chain), the charges disagree, or the item can't be
   * equipped where it's asked to be (`Equipping`: an item already carried takes another entry, a second dagger held in
   * the other hand).
   */
  static planEntry(view: RulesetView, character: CharacterInput, change: EntryChange) {
    const { rulesetData } = view;
    const { request } = change;
    if ("item" in change) {
      const validRulesetIds = new Set([character.record.rulesetId, ...rulesetData.cow.sourceChain]);
      if (!validRulesetIds.has(change.item.rulesetId))
        throw new RulesError("invalid", "Item does not belong to the character's ruleset");
    }
    InventoryEntries.checkCharges(request.totalCharges, request.remainingCharges);

    const { equipped, force, location, weaponSet } = request;
    if (equipped && location) {
      const entry =
        "item" in change
          ? { id: null, item: change.item }
          : { id: change.entry.id, item: rulesetData.itemsById.get(change.entry.itemId) };
      if (!entry.item) throw new RulesError("not-found", "Item not found");
      Equipping.check(view, character, { id: entry.id, item: entry.item }, location, weaponSet, force);
    }
    return InventoryEntries.entryFields(request);
  }
}
