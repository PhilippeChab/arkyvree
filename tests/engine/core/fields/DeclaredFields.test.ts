import { describe, expect, test } from "bun:test";

import { DeclaredFields } from "@/engine/core/fields/index.ts";
import type { FieldDef, LinkRoleDef } from "@/engine/core/module/index.ts";

/** What a made-up module's field definitions share: an entity's text set, read off none. */
const SET = { inheritsVia: null, merge: "union", multiple: true, ownerKind: "entity", valueKind: "text" } as const;

/** Three owner types' fields: a group's among them, a choice, a closed list, a flag, a free text, a number and a link. */
const DECLARED = new DeclaredFields(
  {
    items: {
      tool: {
        fields: {
          damage: { description: "Its dice", field: "DAMAGE", kind: "text", label: "Damage", placeholder: "1d8" },
          family: { description: "Its family", field: "FAMILY", kind: "list", label: "Family", values: ["Bow", "Axe"] },
        },
        kind: "group",
        label: "Tool",
      },
      masterwork: { absent: null, description: "Its make", field: "MW", kind: "flag", label: "Masterwork" },
      charges: { description: "Its charges", field: "CHARGES", kind: "number", label: "Charges" },
    },
    tracks: {
      focusType: { description: "Its magic", field: "FOCUS", kind: "choice", label: "Focus", values: ["Arcane"] },
      patron: {
        description: "Its patron",
        field: "PATRON",
        kind: "ref",
        label: "Patron",
        references: "items",
        role: "patron",
      },
    },
    talents: {
      trained: { description: "Whether it needs training", field: "TRAINED", kind: "flag", label: "Trained" },
    },
  },
  {
    fieldDefs: [
      { ...SET, field: "FAMILY", inheritsVia: "madeFrom", ownerType: "items" },
      { ...SET, field: "MW", inheritsVia: "madeFrom", merge: "fallback", multiple: false, ownerType: "items" },
      { ...SET, field: "FOCUS", merge: "winner", multiple: false, ownerType: "tracks" },
    ] satisfies FieldDef[],
    linkRoles: [{ fromType: "tracks", merge: "winner", role: "patron" } as LinkRoleDef],
  },
);

describe("The fields a module declares", () => {
  test("sort in the order they're declared, every owner type's, a group's too; one none declares after them, by name", () => {
    const fields = ["TRAINED", "ZEAL", "CHARGES", "FOCUS", "AURA", "FAMILY", "MW", "DAMAGE"];
    expect(fields.toSorted((a, b) => DECLARED.compareFields(a, b))).toEqual([
      "DAMAGE",
      "FAMILY",
      "MW",
      "CHARGES",
      "FOCUS",
      "TRAINED",
      "AURA",
      "ZEAL",
    ]);
  });

  test("order a set's values by their closed list, a flag's true first, then the others by text", () => {
    expect(DECLARED.orderValues("FAMILY", ["Sling", "Axe", "Bow", "Club"])).toEqual(["Bow", "Axe", "Club", "Sling"]);
    expect(DECLARED.orderValues("MW", [false, true])).toEqual([true, false]);
    expect(DECLARED.orderValues("CHARGES", [5, 12, 3])).toEqual([12, 3, 5]);
  });

  test("name the roles of the links an owner type's fields read", () => {
    expect(DECLARED.fieldRoles("tracks")).toEqual(["patron"]);
    expect(DECLARED.fieldRoles("items")).toEqual([]);
  });

  test("merge as their definitions and roles say: a set's union and a single link's fallback for one none defines", () => {
    expect(["FAMILY", "MW", "DAMAGE"].map((field) => DECLARED.mergeOf("items", field))).toEqual([
      "union",
      "fallback",
      "union",
    ]);
    expect(DECLARED.mergeOf("tracks", "FOCUS")).toBe("winner");
    expect(DECLARED.roleMergeOf("tracks", "patron")).toBe("winner");
    expect(DECLARED.roleMergeOf("items", "patron")).toBe("fallback");
  });

  test("give the fields an owner type reads off another, by the role of its link to it", () => {
    expect(DECLARED.inheritance("items")).toEqual({ fields: new Set(["FAMILY", "MW"]), role: "madeFrom" });
    expect(DECLARED.inheritance("tracks")).toBeUndefined();
  });
});
