import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { entitiesInRules } from "@/drizzle/schema.ts";
import { OwnerValues } from "@/engine/core/fields/index.ts";
import { SPELL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/spells/fields.ts";
import { db } from "@/server/database/index.ts";
import { Properties } from "@/server/repositories/index.ts";
import { storedValues } from "@/tests/support/storedValues.ts";
import { SPELL_COMPONENT, SPELL_DESCRIPTOR, SPELL_SCHOOL, SPELL_TARGET } from "@/vocabulary/dnd3.5/properties/index.ts";

/** Rows as a sorted list of `type=value`. */
function multiset(rows: { type: string; value: string }[]) {
  return rows.map((row) => `${row.type}=${row.value}`).toSorted();
}

describe("A spell's fields", () => {
  test("are none without their values, and as stored with them: each its first value, the lists in order", () => {
    expect(SPELL_FIELDS.read(OwnerValues.NONE)).toEqual(SPELL_FIELDS.defaults);
    expect(
      SPELL_FIELDS.read(
        storedValues([
          [SPELL_SCHOOL, "Evocation"],
          [SPELL_DESCRIPTOR, "Fire"],
          [SPELL_TARGET, "One creature"],
          [SPELL_TARGET, "You"],
          [SPELL_COMPONENT, "V"],
          [SPELL_DESCRIPTOR, "Light"],
          ["SOMETHING_ELSE", 1],
        ]),
      ),
    ).toEqual({
      ...SPELL_FIELDS.defaults,
      components: ["V"],
      descriptors: ["Fire", "Light"],
      school: "Evocation",
      target: "One creature",
    });
  });

  test("are kept in a property per field with a value, none for an empty one, and none at all without a school", () => {
    expect(SPELL_FIELDS.toProperties({ ...SPELL_FIELDS.defaults, duration: "1 round", target: "You" })).toEqual([]);
    expect(
      multiset(
        SPELL_FIELDS.toProperties({
          ...SPELL_FIELDS.defaults,
          components: ["V"],
          duration: "",
          school: "Evocation",
          target: "You",
        }),
      ),
    ).toEqual([`${SPELL_COMPONENT}=V`, `${SPELL_SCHOOL}=Evocation`, `${SPELL_TARGET}=You`]);
  });

  test("of every seeded spell rebuild its rows", async () => {
    const spells = await db
      .select({ id: entitiesInRules.id, name: entitiesInRules.name })
      .from(entitiesInRules)
      .where(eq(entitiesInRules.type, "spells"));
    const names = new Map(spells.map((spell) => [spell.id, spell.name]));
    const rows = (await Properties.findMany(db, { entityIds: [...names.keys()], entityType: "spells" })).map(
      (property) => ({
        name: names.get(property.entityId),
        spellId: property.entityId,
        type: property.type,
        value: property.value,
      }),
    );
    const rowsBySpell = Map.groupBy(rows, (row) => row.spellId);
    expect(rows.every((row) => SPELL_FIELDS.types.includes(row.type))).toBe(true);
    expect(rowsBySpell.size).toBeGreaterThan(2000);

    const mismatches = [...rowsBySpell].filter(
      ([, stored]) =>
        multiset(SPELL_FIELDS.toProperties(SPELL_FIELDS.read(SPELL_FIELDS.storedOf(stored)))).join("|") !==
        multiset(stored).join("|"),
    );
    expect([...new Set(mismatches.map(([, stored]) => stored[0].name))]).toEqual([]);
  });
});
