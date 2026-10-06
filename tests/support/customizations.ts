import { db } from "@/server/database/index.ts";
import { Modifiers, Properties, Requirements } from "@/server/repositories/index.ts";

/** A requirement's values: a base attack bonus of 5 or more. */
const BAB_AT_LEAST_5 = {
  level: "1",
  target: "combat.bab",
  value: "5",
  valueType: "number",
  operator: "greater_than_or_equal",
} as const;

/** A modifier's values: +2 to Strength's misc bonus. */
export const STRENGTH_BONUS = {
  target: "abilities.strength.misc",
  value: "2",
  valueType: "number",
  operator: "add",
} as const;

/**
 * Gives a row of `type` a requirement, a property (a note by default) and, unless `modifier` is false, a Strength
 * bonus with a requirement of its own: the bonus, when it has one. Customizations point at their row polymorphically,
 * so any row can have them.
 */
export async function customize(
  type: string,
  id: string,
  { modifier = true, property = { type: "NOTE", value: "doomed" } } = {},
) {
  const [bonus] = modifier ? await Modifiers.create(db, { ...STRENGTH_BONUS, sourceId: id, sourceType: type }) : [];
  if (bonus) await Requirements.create(db, { ...BAB_AT_LEAST_5, entityId: bonus.id, entityType: "modifiers" });
  await Requirements.create(db, { ...BAB_AT_LEAST_5, entityId: id, entityType: type });
  await Properties.create(db, { ...property, entityId: id, entityType: type });
  return bonus;
}

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
