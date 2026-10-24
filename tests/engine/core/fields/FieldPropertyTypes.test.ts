import { describe, expect, test } from "bun:test";

import { FieldPropertyTypes } from "@/engine/core/fields/index.ts";

/** Two entity types' fields: a group's among them, a choice, a closed list, a flag, a free text and a number. */
const PROPERTY_TYPES = new FieldPropertyTypes({
  items: {
    tool: {
      fields: {
        damage: { description: "Its dice", kind: "text", label: "Damage", placeholder: 'e.g., "1d8"', type: "DAMAGE" },
        family: { description: "Its family", kind: "text", label: "Family", type: "FAMILY", values: ["Axe", "Bow"] },
      },
      kind: "group",
      label: "Tool",
    },
    masterwork: { absent: null, description: "Whether it's masterwork", kind: "flag", label: "Masterwork", type: "MW" },
    charges: { description: "Its charges", kind: "number", label: "Charges", type: "CHARGES" },
  },
  tracks: {
    focusType: { description: "Its magic", kind: "choice", label: "Focus", type: "FOCUS", values: ["Arcane"] },
  },
  talents: { trained: { description: "Whether it needs training", kind: "flag", label: "Trained", type: "TRAINED" } },
});

describe("The property types of fields", () => {
  test("are every entity type's fields' types, a group's too, each entity type's in their order", () => {
    expect(PROPERTY_TYPES.getTypes()).toEqual(["DAMAGE", "FAMILY", "MW", "CHARGES", "FOCUS", "TRAINED"]);
  });

  test("take a closed list's values, a choice's, a flag's true and false, and none for a free one", () => {
    expect(["FAMILY", "FOCUS"].map((type) => PROPERTY_TYPES.getValues(type))).toEqual([["Axe", "Bow"], ["Arcane"]]);
    expect(["MW", "TRAINED"].map((type) => PROPERTY_TYPES.getValues(type))).toEqual([
      ["true", "false"],
      ["true", "false"],
    ]);
    expect(["DAMAGE", "CHARGES", "UNKNOWN"].map((type) => PROPERTY_TYPES.getValues(type))).toEqual([null, null, null]);
  });
});
