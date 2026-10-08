/** The item types an item can be based on a template of, which the item's form offers and the API's templates list. */

import { isOneOf } from "./isOneOf.ts";

export type TemplateItemType = (typeof TEMPLATE_ITEM_TYPES)[number];

/** A weapon, an armor or a shield can be based on a template: a weapon's, an armor's or a shield's. */
export const TEMPLATE_ITEM_TYPES = ["Weapon", "Armor", "Shield"] as const;

/** Whether an item of `type` can be based on a template. */
export function isTemplateItemType(type: unknown): type is TemplateItemType {
  return isOneOf(type, TEMPLATE_ITEM_TYPES);
}
