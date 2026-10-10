import type { Db } from "@/drizzle/database.ts";
import { EntityRepositories } from "@/server/cow/index.ts";
import { EntityReferences, type RulesetEntityType } from "@/server/repositories/index.ts";

/**
 * Hard-deletes an entity with the links naming it (`EntityReferences.delete`: a feat's link to a list, a class level's
 * grant of a feat or its save); the database deletes its own rows with it (its links, a class's levels and skills) and
 * its customizations. What an unsubscribe deletes of an extension: the fork's copies of its entities, once what the
 * fork keeps of them was repointed or refused (`extensions/departingReferences.ts`).
 */
export async function deleteEntityWithCascade(tx: Db, entityType: RulesetEntityType, entityId: string) {
  const repository = EntityRepositories.of(entityType);
  await repository.lock(tx, { id: entityId });
  await EntityReferences.delete(tx, { entityType, entityId });
  await repository.delete(tx, { id: entityId });
}
