import type { Feat, Item, Klass, KlassLevel, Power, Race } from "@/engine/index.ts";
import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Characters, Entities, Modifiers } from "@/server/repositories/index.ts";
import type { Modifier, Property, Requirement } from "@/shared/relations.ts";

/** Whether the row of an entity customizations are made on is stored: its type's table has it. */
async function isStored(entityId: string, entityType: string): Promise<boolean> {
  switch (entityType) {
    case "feats":
      return !!(await Entities.findOne<Feat>(db, { entityType: "feats", id: entityId }));
    case "items":
      return !!(await Entities.findOne<Item>(db, { entityType: "items", id: entityId }));
    case "powers":
      return !!(await Entities.findOne<Power>(db, { entityType: "powers", id: entityId }));
    case "klass_levels":
      return !!(await Entities.findOne<KlassLevel>(db, { entityType: "klass_levels", id: entityId }));
    case "races":
      return !!(await Entities.findOne<Race>(db, { entityType: "races", id: entityId }));
    case "klasses":
      return !!(await Entities.findOne<Klass>(db, { entityType: "klasses", id: entityId }));
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
