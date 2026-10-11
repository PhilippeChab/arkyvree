import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import {
  Characters,
  Feats,
  Items,
  Klasses,
  KlassLevels,
  Modifiers,
  Powers,
  Races,
} from "@/server/repositories/index.ts";
import type { Modifier, Property, Requirement } from "@/shared/relations.ts";

/** Whether the row of an entity customizations are made on is stored: its type's table has it. */
async function isStored(entityId: string, entityType: string): Promise<boolean> {
  switch (entityType) {
    case "feats":
      return !!(await Feats.findOne(db, { id: entityId }));
    case "items":
      return !!(await Items.findOne(db, { id: entityId }));
    case "powers":
      return !!(await Powers.findOne(db, { id: entityId }));
    case "klass_levels":
      return !!(await KlassLevels.findOne(db, { id: entityId }));
    case "races":
      return !!(await Races.findOne(db, { id: entityId }));
    case "klasses":
      return !!(await Klasses.findOne(db, { id: entityId }));
    case "modifiers":
      return !!(await Modifiers.findOne(db, { id: entityId }));
    case "characters":
      return !!(await Characters.findOne(db, { id: entityId }));
    default:
      return false;
  }
}

/** A 404 unless the entity `customization` is made on is still stored, read from the database itself. */
export async function checkCustomizedEntity(customization: Modifier | Requirement | Property) {
  const [entityId, entityType] =
    "sourceId" in customization
      ? [customization.sourceId, customization.sourceType]
      : [customization.entityId, customization.entityType];
  if (!(await isStored(entityId, entityType))) throw new NotFoundError(`${entityType} not supported`);
}
