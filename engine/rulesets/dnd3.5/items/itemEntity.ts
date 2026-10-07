/** An item as a ruleset's entity: what saving it writes. */

import type { EntityWrites } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/types.ts";
import type { ItemLocation } from "@/shared/enums.ts";

/** What saving an item writes: its slot, its type's (an armor's the torso, a shield's the off hand) or the one given. */
export function planItemSave(
  _view: RulesetView,
  item: { slot?: ItemLocation; type?: string | null },
): EntityWrites<{ slot: ItemLocation | undefined }> {
  const slot = item.type === "Armor" ? "Torso" : item.type === "Shield" ? "Off Hand" : item.slot;
  return { columns: { slot }, generatedFeats: [], removedFeats: [] };
}
