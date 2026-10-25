/**
 * The rows of what every ruleset shares, as the server and the engine read them: accounts, campaigns, a character's own
 * row and inventory, a ruleset's row, its modifiers and requirements. A kind's entity's row and a
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

import type { BaseRules, ItemLocation } from "./enums.ts";

/**
 * The columns of a character's row its module stores as its fields and single links, as the server reads them
 * (`StorageEngine.characterRowOf`): its module declares its own into it (`declare module`, 3.5's identity and race).
 */
export interface CharacterFields {}

export type Campaign = typeof campaignsInCampaign.$inferSelect;
/**
 * A character's row: its own columns, and those its module stores as its fields and single links (`CharacterFields`). A
 * mapped type, as a row is plain data any record type takes (an interface isn't).
 */
export type Character = typeof charactersInCharacter.$inferSelect & Pick<CharacterFields, keyof CharacterFields>;
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
