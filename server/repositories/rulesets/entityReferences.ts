import type { PgColumn } from "drizzle-orm/pg-core";

import {
  advancementPicksInCharacter,
  advancementsInCharacter,
  entityLinksInRules,
  inventoryInCharacter,
  linksInCharacter,
  rulesetLinksInRules,
} from "@/drizzle/schema.ts";

import type { RulesetEntityType } from "./entityTables.ts";

/** What a row names: a ruleset's entity, or a class's level, which a character's level names. */
export type ReferencedType = RulesetEntityType | "klass_levels";

/**
 * What a row naming an entity belongs to. An entity's link (`fromId`): the entity it's from, or the entity that owns
 * it (a class level's grants and saves, its class's). A ruleset's link (`rulesetId`: its skill point ability). A
 * character's row (`characterId`: its race, its scores, an item it carries, a level). An advancement's pick
 * (`advancementId`: a level's feat, its ability increase), its character's.
 */
export type ReferenceOwner =
  | { advancementId: PgColumn }
  | { characterId: PgColumn }
  | { fromId: PgColumn }
  | { rulesetId: PgColumn };

/** A row naming an entity: the column holding the entity's id, and what the row belongs to. */
export interface EntityReference {
  column: PgColumn;
  owner: ReferenceOwner;
}

/**
 * Every row that names an entity, whatever its type, in the generic tables: an entity's links, to it or through it (a
 * class level's grant through a pool), a ruleset's links, and a character's links, levels, picks (to it or through it)
 * and inventory. What a revert points at the source before the copy goes (`EntityRevert`, a restore's and an
 * unsubscribe's), what an unsubscribe finds the ruleset would lose (`EntityReferences.findMany`) or points at what
 * stands in place of what leaves (`findIds`, `update` given the ruleset), and what an in-use check counts (`exists`).
 * An entity's own rows go with it, and so do its customizations (`docs/persistence.md`).
 */
export const ENTITY_REFERENCES: EntityReference[] = [
  { column: entityLinksInRules.toId, owner: { fromId: entityLinksInRules.fromId } },
  { column: entityLinksInRules.viaId, owner: { fromId: entityLinksInRules.fromId } },
  { column: rulesetLinksInRules.toId, owner: { rulesetId: rulesetLinksInRules.rulesetId } },
  { column: linksInCharacter.entityId, owner: { characterId: linksInCharacter.characterId } },
  { column: inventoryInCharacter.itemId, owner: { characterId: inventoryInCharacter.characterId } },
  { column: advancementsInCharacter.trackId, owner: { characterId: advancementsInCharacter.characterId } },
  { column: advancementPicksInCharacter.entityId, owner: { advancementId: advancementPicksInCharacter.advancementId } },
  { column: advancementPicksInCharacter.viaId, owner: { advancementId: advancementPicksInCharacter.advancementId } },
];
