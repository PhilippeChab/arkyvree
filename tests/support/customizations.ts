import { db } from "@/server/database/index.ts";
import { Fields, Modifiers, Requirements } from "@/server/repositories/index.ts";

/** A row's customizations: its modifiers and their own requirements, its requirements and its stored values. */
export async function findCustomizations(type: string, id: string) {
  const modifiers = await Modifiers.findMany(db, { sourceIds: [id], sourceType: type });
  return {
    modifiers,
    modifierRequirements: await Requirements.findMany(db, {
      entityIds: modifiers.map((m) => m.id),
      entityType: "modifiers",
    }),
    requirements: await Requirements.findMany(db, { entityIds: [id], entityType: type }),
    values: (await Fields.findMany(db, { ownerIds: [id], ownerType: type })).get(id)!,
  };
}
