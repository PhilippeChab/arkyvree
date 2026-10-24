import { db } from "@/server/database/index.ts";
import { Modifiers, Properties, Requirements } from "@/server/repositories/index.ts";

/** A row's customizations: its modifiers and their own requirements, its requirements and its properties. */
export async function findCustomizations(type: string, id: string) {
  const modifiers = await Modifiers.findMany(db, { sourceIds: [id], sourceType: type });
  return {
    modifiers,
    modifierRequirements: await Requirements.findMany(db, {
      entityIds: modifiers.map((m) => m.id),
      entityType: "modifiers",
    }),
    requirements: await Requirements.findMany(db, { entityIds: [id], entityType: type }),
    properties: await Properties.findMany(db, { entityIds: [id], entityType: type }),
  };
}
