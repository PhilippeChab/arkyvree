import type { ItemFields } from "@/engine/core/module/rules/index.ts";

import type { PropertiesWrite } from "./writes.ts";

/** What a ruleset writes when an item is saved: its fields. */
export interface ItemsEffects {
  /**
   * Exactly the item's fields given, as its own properties, in place of those it stored before: for an item made from a
   * template, the fields it overrides, which its template's fill in when read (`RulesetData.itemProperties`). A list
   * can't be overridden to none: an item without damage types or magic auras of its own reads its template's.
   */
  properties(itemId: string, fields: ItemFields): PropertiesWrite;
}
