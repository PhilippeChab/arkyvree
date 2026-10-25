import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { entitiesInRules } from "@/drizzle/schema.ts";
import { OwnerValues } from "@/engine/core/fields/index.ts";
import { SPELL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/spells/fields.ts";
import { db } from "@/server/database/index.ts";
import { Fields } from "@/server/repositories/index.ts";
import { listStoredValues, storedValues } from "@/tests/support/storedValues.ts";
import { SPELL_COMPONENT, SPELL_DESCRIPTOR, SPELL_SCHOOL, SPELL_TARGET } from "@/vocabulary/dnd3.5/properties/index.ts";

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

  test("are kept in a value per field with a value, none for an empty one, and none at all without a school", () => {
    const written = (values: typeof SPELL_FIELDS.defaults) => OwnerValues.written(SPELL_FIELDS.write(values));
    expect(written({ ...SPELL_FIELDS.defaults, duration: "1 round", target: "You" })).toEqual(OwnerValues.NONE);
    expect(
      listStoredValues(
        written({ ...SPELL_FIELDS.defaults, components: ["V"], duration: "", school: "Evocation", target: "You" }),
      ),
    ).toEqual([`${SPELL_COMPONENT}=V`, `${SPELL_SCHOOL}=Evocation`, `${SPELL_TARGET}=You`]);
  });

  test("of every seeded spell rebuild its stored values", async () => {
    const spells = await db
      .select({ id: entitiesInRules.id, name: entitiesInRules.name })
      .from(entitiesInRules)
      .where(eq(entitiesInRules.type, "spells"));
    const names = new Map(spells.map((spell) => [spell.id, spell.name]));
    const values = await Fields.findMany(db, { ownerIds: [...names.keys()], ownerType: "spells" });
    const held = [...values].filter(([, stored]) => Object.keys(stored.fields).length > 0);
    expect(held.length).toBeGreaterThan(2000);

    const mismatches = held.filter(
      ([, stored]) =>
        listStoredValues(OwnerValues.written(SPELL_FIELDS.write(SPELL_FIELDS.read(stored)))).join("|") !==
        listStoredValues(stored).join("|"),
    );
    expect([...new Set(mismatches.map(([spellId]) => names.get(spellId)))]).toEqual([]);
  });
});
