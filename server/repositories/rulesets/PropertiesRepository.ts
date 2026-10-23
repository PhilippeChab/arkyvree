import type { Db } from "@/drizzle/database.ts";
import StoredFields, { type FieldValues } from "@/server/repositories/stored/StoredFields.ts";

/**
 * An entity's and a ruleset's properties: the fields their module declares beside their kind's columns (a feat's family,
 * a spell's school, a ruleset's feat advancement), and those whose value names an entity, which are links. Read and
 * written as properties (`StoredFields`), which the engine reads.
 */
class PropertiesRepository {
  /** A `where` that names no entities would pick every one's properties: it throws instead, as a repository's does. */
  private static named(where: { entityIds?: string[] }) {
    if (!where.entityIds) throw new Error("PropertiesRepository: a where that matches none of its branches");
  }

  async createMany(db: Db, values: FieldValues[]) {
    await StoredFields.createMany(db, values);
  }

  /** Removes the properties of entities of a type: those of `types`, or every one. */
  async delete(db: Db, where: { entityIds: string[]; entityType: string; types?: readonly string[] }) {
    PropertiesRepository.named(where);
    await StoredFields.delete(db, where);
  }

  async findMany(
    db: Db,
    where:
      | { entityIds: string[]; entityType: string }
      | { entityIds: string[]; entityType: string; type: string }
      | { entityIds: string[] },
  ) {
    PropertiesRepository.named(where);
    return await StoredFields.findMany(db, where);
  }
}

export default PropertiesRepository;
