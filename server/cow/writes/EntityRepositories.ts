import type { Db } from "@/drizzle/database.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Entities, type RulesetEntityType } from "@/server/repositories/index.ts";

/** What the COW code calls on any ruleset entity kind's rows: the generic entities', bound to the kind. */
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

/** A ruleset entity type's rows, as copy-on-write uses them, and the lock a change to one of its entities takes. */
export default class EntityRepositories {
  /** A kind's rows (`entityType`): the generic entities' (`Entities`), bound to the kind. */
  static of(entityType: RulesetEntityType): EntityRepository {
    return {
      create: (tx, values) => Entities.create<EntityWithId>(tx, entityType, values),
      delete: (tx, where) => Entities.delete(tx, { entityType, ...where }),
      exists: (db, where) => Entities.has(db, { entityType, ...where }),
      findMany: (db, where) => Entities.findMany<EntityWithId>(db, { entityType, ...where }),
      findOne: (db, where) => Entities.findOne<EntityWithId>(db, { entityType, ...where }),
      lock: (tx, where, mode) => Entities.lock(tx, where, mode),
    };
  }

  /** Locks an entity a change writes under (its customizations, its delete), by its stored id: a not found when gone. */
  static async lock(tx: Db, entityType: RulesetEntityType, entityId: string): Promise<void> {
    if (!(await EntityRepositories.of(entityType).lock(tx, { id: entityId })))
      throw new NotFoundError("Customization source no longer exists; refresh the entity");
  }
}
