import { db } from "@/server/database/index.ts";
import { Modifiers, Properties, Requirements } from "@/server/repositories/index.ts";
import type { Character } from "@/shared/relations.ts";

import { invalidateSeededRuleset } from "./rulesets.ts";
import { getSeedCtx } from "./seed.ts";

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
 * A modifier of the character's race (a number added, unless `modifier` says otherwise), gated by `requirements` when
 * given, each a condition of its one group: it applies to the character, and to every character of its race.
 */
export async function createRaceModifier(
  character: Pick<Character, "raceId">,
  modifier: { operator?: string; target: string; value: string; valueType?: string },
  requirements: { operator: string; target: string; value: string; valueType: string }[] = [],
) {
  const [created] = await Modifiers.create(db, {
    sourceId: character.raceId,
    sourceType: "races",
    operator: "add",
    valueType: "number",
    ...modifier,
  });
  for (const [index, requirement] of requirements.entries()) {
    await Requirements.create(db, {
      entityId: created.id,
      entityType: "modifiers",
      level: String(index + 1),
      ...requirement,
    });
  }
  invalidateSeededRuleset((await getSeedCtx()).rulesetId);
  return created;
}

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
