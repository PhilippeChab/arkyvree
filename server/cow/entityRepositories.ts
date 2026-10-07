/** Each ruleset entity type's repository, as copy-on-write uses it, and the lock a change takes on one. */

import type { Db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import {
  Abilities,
  Aptitudes,
  Feats,
  Items,
  Klasses,
  Languages,
  Mechanics,
  Powers,
  Races,
  type RulesetEntityType,
  Saves,
  Skills,
} from "@/server/repositories/index.ts";

/**
 * What the COW code calls on any ruleset entity's repository. Properties, which TypeScript checks strictly, except
 * `create`: a method, whose looser check lets each repository's insert model stand for a copied row.
 */
interface EntityRepository {
  lock: (db: Db, where: { id: string }, mode?: "update" | "share") => Promise<boolean>;
  exists: (db: Db, where: { id: string }) => Promise<boolean>;
  findOne: (db: Db, where: { id: string } | { name: string; rulesetId: string }) => Promise<EntityWithId | undefined>;
  findMany: (db: Db, where: { ids: string[] }) => Promise<EntityWithId[]>;
  create(db: Db, values: Record<string, unknown>): Promise<EntityWithId[]>;
  delete: (db: Db, where: { id: string }) => Promise<unknown>;
}

export interface EntityWithId {
  id: string;
  rulesetId: string;
  [key: string]: unknown;
}

export const ENTITY_REPOS: Record<RulesetEntityType, EntityRepository> = {
  abilities: Abilities,
  saves: Saves,
  skills: Skills,
  feats: Feats,
  powers: Powers,
  items: Items,
  races: Races,
  languages: Languages,
  klasses: Klasses,
  aptitudes: Aptitudes,
  mechanics: Mechanics,
};

/** Locks an entity a change writes under (its customizations, its delete), by its stored id: a not found when gone. */
export async function lockEntityForMutation(tx: Db, entityType: RulesetEntityType, entityId: string): Promise<void> {
  if (!(await ENTITY_REPOS[entityType].lock(tx, { id: entityId })))
    throw new NotFoundError("Customization source no longer exists; refresh the entity");
}
