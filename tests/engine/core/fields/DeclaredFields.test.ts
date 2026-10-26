import { describe, expect, test } from "bun:test";

import { DeclaredFields } from "@/engine/core/fields/index.ts";
import type { FieldValue, LinkRoleDef } from "@/engine/core/module/index.ts";
import type { StandaloneKind } from "@/engine/core/view/index.ts";

/** The made-up kind a reference names: one no module declares, typed as the view's registry types a kind. */
const GIZMOS = "gizmos" as string as StandaloneKind;

/**
 * Three owner types' fields: a group's among them, a choice, a closed list, a flag, a free text, numbers and a link;
 * each with its merge, a gizmo's family and make read off its template, a flag always written.
 */
const DECLARED = new DeclaredFields(
  {
    gizmos: {
      tool: {
        fields: {
          damage: {
            description: "Its dice",
            field: "DAMAGE",
            kind: "text",
            label: "Damage",
            merge: "fallback",
            placeholder: "1d8",
          },
          family: {
            description: "Its family",
            field: "FAMILY",
            inherits: "madeFrom",
            kind: "list",
            label: "Family",
            merge: "union",
            values: ["Bow", "Axe"],
          },
        },
        kind: "group",
        label: "Tool",
      },
      masterwork: {
        absent: null,
        description: "Its make",
        field: "MW",
        inherits: "madeFrom",
        kind: "flag",
        label: "Masterwork",
        merge: "fallback",
      },
      charges: { description: "Its charges", field: "CHARGES", kind: "number", label: "Charges", merge: "winner" },
      cost: {
        description: "Its cost",
        field: "COST",
        form: "column",
        kind: "number",
        label: "Cost",
        merge: "winner",
        scale: 2,
      },
    },
    tracks: {
      focusType: {
        description: "Its magic",
        field: "FOCUS",
        kind: "choice",
        label: "Focus",
        merge: "winner",
        values: ["Arcane"],
      },
      patron: {
        description: "Its patron",
        kind: "ref",
        label: "Patron",
        references: GIZMOS,
        role: "patron",
      },
    },
    talents: {
      trained: {
        default: true,
        description: "Whether it needs training",
        field: "TRAINED",
        form: "hidden",
        kind: "flag",
        label: "Trained",
        merge: "winner",
        write: "always",
      },
      secret: {
        description: "Whether it's kept secret",
        field: "SECRET",
        kind: "flag",
        label: "Secret",
        merge: "fallback",
        write: "always",
      },
    },
  },
  [
    { fromType: "tracks", merge: "union", role: "patron" } as LinkRoleDef,
    { fromType: "gizmos", merge: "fallback", role: "madeFrom" } as LinkRoleDef,
  ],
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

  test("hold an owner's fields in their declared order: a single field's value, a set's values in theirs", () => {
    const rows = (field: string, ...values: FieldValue[]) =>
      values.map((value, ordinal) => ({ field, ordinal, value }));
    const fields = DECLARED.fieldsOf("gizmos", [
      ...rows("MW", true),
      ...rows("FAMILY", "Axe", "Bow"),
      ...rows("DAMAGE", "1d8"),
      ...rows("AURA", "faint"),
    ]);
    expect(fields).toEqual({ DAMAGE: "1d8", FAMILY: ["Bow", "Axe"], MW: true, AURA: "faint" });
    expect(Object.keys(fields)).toEqual(["DAMAGE", "FAMILY", "MW", "AURA"]);
    // A field none declares holds one value, or its several as a set
    expect(DECLARED.fieldsOf("gizmos", rows("AURA", "faint", "strong"))).toEqual({ AURA: ["faint", "strong"] });
    // A single field holds its first row's value, whatever order its rows come in
    expect(
      DECLARED.fieldsOf("gizmos", [{ field: "DAMAGE", ordinal: 1, value: "2d6" }, ...rows("DAMAGE", "1d8")]),
    ).toEqual({ DAMAGE: "1d8" });
  });

  test("merge as their declarations and roles say: the winner's alone for one none declares", () => {
    expect(["FAMILY", "MW", "CHARGES", "AURA"].map((field) => DECLARED.mergeOf("gizmos", field))).toEqual([
      "union",
      "fallback",
      "winner",
      "winner",
    ]);
    expect(DECLARED.mergeOf("tracks", "FOCUS")).toBe("winner");
    expect(DECLARED.roleMergeOf("tracks", "patron")).toBe("union");
    expect(DECLARED.roleMergeOf("gizmos", "madeFrom")).toBe("fallback");
    expect(DECLARED.roleMergeOf("gizmos", "patron")).toBe("winner");
  });

  test("give the fields an owner type reads off another, by the role of its link to it", () => {
    expect(DECLARED.inheritance("gizmos")).toEqual({ fields: new Set(["FAMILY", "MW"]), role: "madeFrom" });
    expect(DECLARED.inheritance("tracks")).toBeUndefined();
    expect(
      () =>
        new DeclaredFields(
          {
            gizmos: {
              one: { description: "", field: "ONE", inherits: "madeFrom", kind: "text", label: "", merge: "winner" },
              two: { description: "", field: "TWO", inherits: "copyOf", kind: "text", label: "", merge: "winner" },
            },
          },
          [],
        ),
    ).toThrow("gizmos reads its fields off others through madeFrom and copyOf");
  });

  test("keep a number to its declared places, and write an always written field's default", () => {
    expect(DECLARED.scaleOf("gizmos", "COST")).toBe(2);
    expect(DECLARED.scaleOf("gizmos", "CHARGES")).toBeUndefined();
    expect(DECLARED.scaleOf("tracks", "COST")).toBeUndefined();
    // A flag's own default, false without one; none of another owner type's
    expect(DECLARED.writtenDefaults("talents")).toEqual({ TRAINED: true, SECRET: false });
    expect(DECLARED.writtenDefaults("gizmos")).toEqual({});
  });
});
