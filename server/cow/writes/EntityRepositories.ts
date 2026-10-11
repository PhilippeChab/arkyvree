import type { Db } from "@/drizzle/database.ts";
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
  create(db: Db, values: Record<string, unknown>): Promise<EntityWithId[]>;
  delete: (db: Db, where: { id: string }) => Promise<unknown>;
  exists: (db: Db, where: { id: string }) => Promise<boolean>;
  findMany: (db: Db, where: { ids: string[] }) => Promise<EntityWithId[]>;
  findOne: (db: Db, where: { id: string }) => Promise<EntityWithId | undefined>;
  lock: (db: Db, where: { id: string }, mode?: "update" | "share") => Promise<boolean>;
}

export interface EntityWithId {
  [key: string]: unknown;
  id: string;
  rulesetId: string;
}

/** Each ruleset entity type's repository. */
const REPOSITORIES: Record<RulesetEntityType, EntityRepository> = {
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

/** A ruleset entity type's repository, as copy-on-write uses it, and the lock a change to one of its entities takes. */
export default class EntityRepositories {
  /** The repository of an entity type's table. */
  static of(entityType: RulesetEntityType): EntityRepository {
    return REPOSITORIES[entityType];
  }

  /** Locks an entity a change writes under (its customizations, its delete), by its stored id: a not found when gone. */
  static async lock(tx: Db, entityType: RulesetEntityType, entityId: string): Promise<void> {
    if (!(await REPOSITORIES[entityType].lock(tx, { id: entityId })))
      throw new NotFoundError("Customization source no longer exists; refresh the entity");
  }
}
