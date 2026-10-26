import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { entitiesInRules } from "@/drizzle/schema.ts";
import { OwnerValues } from "@/engine/core/fields/index.ts";
import { SPELL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/spells/fields.ts";
import { db } from "@/server/database/index.ts";
import { Entities } from "@/server/repositories/index.ts";
import { heldValues, listValues, writtenValues } from "@/tests/support/ownerValues.ts";
import {
  SPELL_COMPONENT,
  SPELL_DESCRIPTOR,
  SPELL_SAVE_EFFECT,
  SPELL_SCHOOL,
  SPELL_TARGET,
} from "@/vocabulary/dnd3.5/fields/index.ts";

describe("A spell's fields", () => {
  test("are none without their values, and as stored with them: each its first value, the lists in order", () => {
    expect(SPELL_FIELDS.read(OwnerValues.NONE)).toEqual(SPELL_FIELDS.defaults);
    expect(
      SPELL_FIELDS.read(
        heldValues([
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

  test("are kept in a value per field with a value, none for an empty one, and none its form shows without a school", () => {
    const written = (values: typeof SPELL_FIELDS.defaults) => writtenValues(SPELL_FIELDS.write(values));
    expect(written({ ...SPELL_FIELDS.defaults, duration: "1 round", target: "You" })).toEqual({
      fields: {},
      links: {},
    });
    // What a save against it does, a column of its own, kept all the same
    expect(written({ ...SPELL_FIELDS.defaults, saveEffect: "negates" }).fields).toEqual({
      [SPELL_SAVE_EFFECT]: ["negates"],
    });
    expect(
      listValues(
        written({ ...SPELL_FIELDS.defaults, components: ["V"], duration: "", school: "Evocation", target: "You" }),
      ),
    ).toEqual([`${SPELL_COMPONENT}=V`, `${SPELL_SCHOOL}=Evocation`, `${SPELL_TARGET}=You`]);
  });

  test("of every seeded spell rebuild its fields", async () => {
    const spells = await db
      .select({ id: entitiesInRules.id })
      .from(entitiesInRules)
      .where(eq(entitiesInRules.type, "spells"));
    const held = (await Entities.findMany(db, { entityType: "spells", ids: spells.map(({ id }) => id) })).filter(
      (spell) => Object.keys(spell.fields).length > 0,
    );
    expect(held.length).toBeGreaterThan(2000);

    const mismatches = held.filter(
      ({ fields }) =>
        listValues(writtenValues(SPELL_FIELDS.write(SPELL_FIELDS.read({ fields, links: {} })))).join("|") !==
        listValues({ fields, links: {} }).join("|"),
    );
    expect([...new Set(mismatches.map(({ name }) => name))]).toEqual([]);
  });
});
