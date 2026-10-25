import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Characters, CUSTOMIZABLE_TYPES, Entities, Modifiers } from "@/server/repositories/index.ts";
import type { Modifier, Requirement } from "@/shared/relations.ts";

/** Whether the row of an entity customizations are made on is stored: a customizable kind's, a modifier, a character. */
async function isStored(entityId: string, entityType: string): Promise<boolean> {
  if (CUSTOMIZABLE_TYPES.includes(entityType)) return await Entities.has(db, { entityType, id: entityId });
  if (entityType === "modifiers") return !!(await Modifiers.findOne(db, { id: entityId }));
  if (entityType === "characters") return !!(await Characters.findOne(db, { id: entityId }));
  return false;
}

/** A 404 unless the entity `customization` is made on is still stored, read from the database itself. */
export async function checkCustomizedEntity(customization: Modifier | Requirement) {
  const [entityId, entityType] =
    "sourceId" in customization
      ? [customization.sourceId, customization.sourceType]
      : [customization.entityId, customization.entityType];
  if (!(await isStored(entityId, entityType))) throw new NotFoundError(`${entityType} not supported`);
}
