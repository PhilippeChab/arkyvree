import { db } from "@/server/database/index.ts";
import { Modifiers, Requirements } from "@/server/repositories/index.ts";

import { findFormValues } from "./ownerValues.ts";

/** A row's customizations: its modifiers and their own requirements, its requirements, and the values its form writes. */
export async function findCustomizations(type: string, id: string) {
  const modifiers = await Modifiers.findMany(db, { sourceIds: [id], sourceType: type });
  return {
    modifiers,
    modifierRequirements: await Requirements.findMany(db, {
      entityIds: modifiers.map((m) => m.id),
      entityType: "modifiers",
    }),
    requirements: await Requirements.findMany(db, { entityIds: [id], entityType: type }),
    values: await findFormValues(type, id),
  };
}
