/**
 * The rows of what every ruleset shares, as the server and the engine read them: accounts, campaigns, a character's own
 * row (its own columns, fields and single links, as stored) and inventory, a ruleset's row, its modifiers and
 * requirements. A kind's entity's row is the engine's (`engine/core/view/rows.ts`), as its module declares it, and so
 * are a character's links, advancements and picks, as stored (`engine/core/module/storage.ts`).
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

import type { BaseRules, ItemLocation } from "./enums.ts";

export type Campaign = typeof campaignsInCampaign.$inferSelect;
/**
 * A character's row as stored: its own columns, its fields' values by field, each typed as its column holds it (3.5's
 * `CHARACTER_XP`, a number), and the entity of each of its single links by role (3.5's `race`). A mapped type, as a row
 * is plain data any record type takes (an interface isn't).
 */
export type Character = typeof charactersInCharacter.$inferSelect & {
  fields: Record<string, CharacterFieldValue>;
  links: Record<string, string>;
};
/** A character's field's value, as its typed column holds it: a text or a number. */
export type CharacterFieldValue = number | string;
/** An inventory entry: an item a character holds, where, in which groups (3.5's weapon sets), and its charges. */
export type CharacterInventory = Omit<typeof inventoryInCharacter.$inferSelect, "itemType" | "location"> & {
  location: ItemLocation | null;
};
export type Invite = typeof invitesInCampaign.$inferSelect;
export type Modifier = typeof modifiersInCustomization.$inferSelect;
export type Player = typeof playersInCampaign.$inferSelect;
export type Requirement = typeof requirementsInCustomization.$inferSelect;
/** A ruleset's row: its base rules, a registered module's. */
export type Ruleset = Omit<typeof rulesetsInRules.$inferSelect, "baseRules"> & { baseRules: BaseRules };
export type Session = typeof sessionsInAccount.$inferSelect;
export type User = typeof usersInAccount.$inferSelect;
