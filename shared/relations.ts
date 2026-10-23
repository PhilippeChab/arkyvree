/**
 * The rows of what every ruleset shares, as the server and the engine read them: accounts, campaigns, a character's own
 * row and inventory, a ruleset's row, its properties, modifiers and requirements. A kind's entity's row and a
 * character's links and picks are the engine's (`engine/core/view/rows.ts`), as their module declares them.
 */

import type {
  campaignsInCampaign,
  charactersInCharacter,
  inventoryInCharacter,
  invitesInCampaign,
  modifiersInCustomization,
  playersInCampaign,
  requirementsInCustomization,
  rulesetsInRules,
  sessionsInAccount,
  usersInAccount,
} from "@/drizzle/schema.ts";

import type { Alignment, BaseRules, Gender, ItemLocation } from "./enums.ts";

/** A property's columns (`Property`). */
interface PropertyColumns {
  createdAt: string;
  deletedAt: string | null;
  description: string | null;
  entityId: string;
  entityType: string;
  id: string;
  type: string;
  updatedAt: string;
  value: string;
}

export type Campaign = typeof campaignsInCampaign.$inferSelect;
/** A character's row, with its identity's fields and its race. */
export type Character = typeof charactersInCharacter.$inferSelect & {
  age: number | null;
  alignment: Alignment;
  deity: string | null;
  gender: Gender;
  height: string | null;
  raceId: string;
  weight: string | null;
  xp: number;
};
/** An inventory entry: an item a character holds, where, in which weapon sets, and its charges. */
export type CharacterInventory = Omit<typeof inventoryInCharacter.$inferSelect, "groups" | "itemType" | "location"> & {
  location: ItemLocation | null;
  weaponSets: number[];
};
export type Invite = typeof invitesInCampaign.$inferSelect;
export type Modifier = typeof modifiersInCustomization.$inferSelect;
export type Player = typeof playersInCampaign.$inferSelect;
/**
 * An entity's or a ruleset's field, as its property was: its owner, its type (the field) and its value as text, a set
 * one row per value. `id` names it by its owner, its field and its value's key, which no other row shares. A mapped
 * type, as a row's answer is plain data any record type takes (an interface isn't).
 */
export type Property = Pick<PropertyColumns, keyof PropertyColumns>;
export type Requirement = typeof requirementsInCustomization.$inferSelect;
/** A ruleset's row: its base rules, a registered module's. */
export type Ruleset = Omit<typeof rulesetsInRules.$inferSelect, "baseRules"> & { baseRules: BaseRules };
export type Session = typeof sessionsInAccount.$inferSelect;
export type User = typeof usersInAccount.$inferSelect;
