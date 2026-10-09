import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { powersInRules, propertiesInCustomization } from "@/drizzle/schema.ts";
import PowerFields, { POWER_FIELD_PROPERTY_TYPES } from "@/engine/rulesets/dnd3.5/entities/powers/PowerFields.ts";
import { db } from "@/server/database/index.ts";
import { SPELL_COMPONENT, SPELL_DESCRIPTOR, SPELL_SCHOOL, SPELL_TARGET } from "@/shared/dnd3.5/properties/index.ts";

/**
 * The seeded spells whose rows a spell's fields can't hold, until the parser stops writing them: an Effect line stored
 * as a second target (#422), and an empty duration (#423).
 */
const SPELLS_THE_FIELDS_CANNOT_HOLD = [
  "Animate Fire",
  "Animate Water",
  "Commune With Greater Spirit",
  "Continual Flame",
  "Forestfold",
  "Lightning Blade",
  "Otiluke's Greater Dispelling Screen",
  "Poison Vines",
  "Repair Critical Damage",
  "Repair Minor Damage",
  "Repair Moderate Damage",
  "Repair Serious Damage",
  "Spirit Binding",
  "Spirit Binding, Greater",
  "Sword of Darkness",
  "Tortoise Shell",
  "Visage of the Deity",
  "Visage of the Deity, Greater",
];

/** Rows as a sorted list of `type=value`. */
function multiset(rows: { type: string; value: string }[]) {
  return rows.map((row) => `${row.type}=${row.value}`).toSorted();
}

describe("A power's fields", () => {
  test("are none without their properties, and as stored with them: each from its first row, the lists in order", () => {
    expect(PowerFields.read([])).toEqual({ components: [], descriptors: [] });
    expect(
      PowerFields.read([
        { type: SPELL_SCHOOL, value: "Evocation" },
        { type: SPELL_DESCRIPTOR, value: "Fire" },
        { type: SPELL_TARGET, value: "One creature" },
        { type: SPELL_TARGET, value: "You" },
        { type: SPELL_COMPONENT, value: "V" },
        { type: SPELL_DESCRIPTOR, value: "Light" },
        { type: "SOMETHING_ELSE", value: "1" },
      ]),
    ).toEqual({ components: ["V"], descriptors: ["Fire", "Light"], school: "Evocation", target: "One creature" });
  });

  test("are kept in a property per field with a value, none for an empty one, and none at all without a school", () => {
    expect(PowerFields.toProperties({ duration: "1 round", target: "You" })).toEqual([]);
    expect(
      multiset(PowerFields.toProperties({ components: ["V"], duration: "", school: "Evocation", target: "You" })),
    ).toEqual([`${SPELL_COMPONENT}=V`, `${SPELL_SCHOOL}=Evocation`, `${SPELL_TARGET}=You`]);
  });

  test("of every seeded spell rebuild its rows, but for the spells they can't hold", async () => {
    const rows = await db
      .select({
        name: powersInRules.name,
        powerId: powersInRules.id,
        type: propertiesInCustomization.type,
        value: propertiesInCustomization.value,
      })
      .from(propertiesInCustomization)
      .innerJoin(powersInRules, eq(powersInRules.id, propertiesInCustomization.entityId))
      .where(eq(propertiesInCustomization.entityType, "powers"));
    const rowsByPower = Map.groupBy(rows, (row) => row.powerId);
    expect(rows.every((row) => POWER_FIELD_PROPERTY_TYPES.includes(row.type))).toBe(true);
    expect(rowsByPower.size).toBeGreaterThan(2000);

    const mismatches = [...rowsByPower].filter(
      ([, stored]) =>
        multiset(PowerFields.toProperties(PowerFields.read(stored))).join("|") !== multiset(stored).join("|"),
    );
    expect([...new Set(mismatches.map(([, stored]) => stored[0].name))].toSorted()).toEqual(
      SPELLS_THE_FIELDS_CANNOT_HOLD,
    );
  });
});
