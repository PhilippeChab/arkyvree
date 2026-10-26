import { Engine, type FieldsWrite } from "@/engine/index.ts";
import { db } from "@/server/database/index.ts";
import { Fields, Modifiers, Requirements } from "@/server/repositories/index.ts";
import type { Character } from "@/shared/relations.ts";
import { invalidateSeededRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

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
 * A write of a text field of `type`'s a module declares past its kind's own fields: a value a test sets ("doomed"), or
 * none when the type keeps no such field (an ability, a save).
 */
function textValues(type: string): FieldsWrite | null {
  const storage = Engine.storage();
  // A character's fields are its row's own values; a kind's own fields its record's
  if (type === "characters") return null;
  const isKind = storage.registries().entityTypes.some((def) => def.type === type);
  const own = isKind ? (storage.kind(type).fields ?? {}) : {};
  const def = storage
    .registries()
    .fieldDefs.find((field) => field.ownerType === type && field.valueKind === "text" && !(field.field in own));
  return def ? { fields: { [def.field]: ["doomed"] }, links: {} } : null;
}

/**
 * A modifier of the character's race (a number added, unless `modifier` says otherwise), gated by `requirements` when
 * given, each a condition of its one group: it applies to the character, and to every character of its race.
 */
export async function createRaceModifier(
  character: Pick<Character, "links">,
  modifier: { operator?: string; target: string; value: string; valueType?: string },
  requirements: { operator: string; target: string; value: string; valueType: string }[] = [],
) {
  const [created] = await Modifiers.create(db, {
    sourceId: character.links.race,
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
 * Gives a row of `type` a requirement, stored values (a note by default) and, unless `modifier` is false, a Strength
 * bonus with a requirement of its own: the bonus, when it has one. Customizations point at their row polymorphically,
 * so any row can have them.
 */
export async function customize(
  type: string,
  id: string,
  { modifier = true, values = textValues(type) }: { modifier?: boolean; values?: FieldsWrite | null } = {},
) {
  const [bonus] = modifier ? await Modifiers.create(db, { ...STRENGTH_BONUS, sourceId: id, sourceType: type }) : [];
  if (bonus) await Requirements.create(db, { ...BAB_AT_LEAST_5, entityId: bonus.id, entityType: "modifiers" });
  await Requirements.create(db, { ...BAB_AT_LEAST_5, entityId: id, entityType: type });
  if (values) await Fields.update(db, [{ id, type, values }]);
  return bonus;
}
