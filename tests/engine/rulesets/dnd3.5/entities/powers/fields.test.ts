import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { entitiesInRules } from "@/drizzle/schema.ts";
import { POWER_FIELDS } from "@/engine/rulesets/dnd3.5/entities/powers/fields.ts";
import { db } from "@/server/database/index.ts";
import { Properties } from "@/server/repositories/index.ts";
import { SPELL_COMPONENT, SPELL_DESCRIPTOR, SPELL_SCHOOL, SPELL_TARGET } from "@/vocabulary/dnd3.5/properties/index.ts";

/** Rows as a sorted list of `type=value`. */
function multiset(rows: { type: string; value: string }[]) {
  return rows.map((row) => `${row.type}=${row.value}`).toSorted();
}

describe("A power's fields", () => {
  test("are none without their properties, and as stored with them: each from its first row, the lists in order", () => {
    expect(POWER_FIELDS.read([])).toEqual(POWER_FIELDS.defaults);
    expect(
      POWER_FIELDS.read([
        { type: SPELL_SCHOOL, value: "Evocation" },
        { type: SPELL_DESCRIPTOR, value: "Fire" },
        { type: SPELL_TARGET, value: "One creature" },
        { type: SPELL_TARGET, value: "You" },
        { type: SPELL_COMPONENT, value: "V" },
        { type: SPELL_DESCRIPTOR, value: "Light" },
        { type: "SOMETHING_ELSE", value: "1" },
      ]),
    ).toEqual({
      ...POWER_FIELDS.defaults,
      components: ["V"],
      descriptors: ["Fire", "Light"],
      school: "Evocation",
      target: "One creature",
    });
  });

  test("are kept in a property per field with a value, none for an empty one, and none at all without a school", () => {
    expect(POWER_FIELDS.toProperties({ ...POWER_FIELDS.defaults, duration: "1 round", target: "You" })).toEqual([]);
    expect(
      multiset(
        POWER_FIELDS.toProperties({
          ...POWER_FIELDS.defaults,
          components: ["V"],
          duration: "",
          school: "Evocation",
          target: "You",
        }),
      ),
    ).toEqual([`${SPELL_COMPONENT}=V`, `${SPELL_SCHOOL}=Evocation`, `${SPELL_TARGET}=You`]);
  });

  test("of every seeded spell rebuild its rows", async () => {
    const powers = await db
      .select({ id: entitiesInRules.id, name: entitiesInRules.name })
      .from(entitiesInRules)
      .where(eq(entitiesInRules.type, "powers"));
    const names = new Map(powers.map((power) => [power.id, power.name]));
    const rows = (await Properties.findMany(db, { entityIds: [...names.keys()], entityType: "powers" })).map(
      (property) => ({
        name: names.get(property.entityId),
        powerId: property.entityId,
        type: property.type,
        value: property.value,
      }),
    );
    const rowsByPower = Map.groupBy(rows, (row) => row.powerId);
    expect(rows.every((row) => POWER_FIELDS.types.includes(row.type))).toBe(true);
    expect(rowsByPower.size).toBeGreaterThan(2000);

    const mismatches = [...rowsByPower].filter(
      ([, stored]) =>
        multiset(POWER_FIELDS.toProperties(POWER_FIELDS.read(stored))).join("|") !== multiset(stored).join("|"),
    );
    expect([...new Set(mismatches.map(([, stored]) => stored[0].name))]).toEqual([]);
  });
});
