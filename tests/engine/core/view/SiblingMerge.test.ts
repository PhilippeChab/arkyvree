import { describe, expect, test } from "bun:test";

import { DeclaredFields, type StoredValues } from "@/engine/core/fields/index.ts";
import { SiblingMerge } from "@/engine/core/view/index.ts";
import RequirementTree from "@/shared/customization/RequirementTree.ts";
import type { Requirement } from "@/shared/relations.ts";

/**
 * A made-up owner's single values, each the first copy's that changed it from what it copied, else its winner's, else
 * its first sibling's: a flag, and a number of default 1.
 */
const COPY_FIELDS = new DeclaredFields(
  {
    owners: {
      count: {
        default: 1,
        description: "Its count",
        field: "COUNT",
        kind: "number",
        label: "Count",
        merge: "fallback",
      },
      flag: { description: "Its flag", field: "FLAG", kind: "flag", label: "Flag", merge: "fallback" },
    },
  },
  [],
);

/** A made-up owner's values: its fields', no link. */
function held(fields: StoredValues["fields"]): StoredValues {
  return { fields, links: {} };
}

/**
 * The winner's requirements (`own`) with a sibling's merged in, as the view reads them: each row's level by its id, the
 * ids of the top-level rows, and those of the rows under a condition, which the tree leaves out.
 */
function mergeOf(own: Requirement[], sibling: Requirement[]) {
  const rows = [...own, ...SiblingMerge.mergeRequirements(own, [sibling], "winner")];
  const tree = RequirementTree.fromRows(rows);
  return {
    levels: Object.fromEntries(rows.map((row) => [row.id, row.level])),
    roots: tree.roots.map((node) => node.requirement.id),
    detached: tree.detached.map((row) => row.id),
  };
}

/** A made-up owner's requirement row at `level`: a condition, or a group with its chaining operator. */
function rowOf(id: string, entityId: string, level: string, chainingOperator?: string): Requirement {
  const condition = { target: "owners.score", operator: "greater_than_or_equal", value: id, valueType: "number" };
  return {
    id,
    entityId,
    entityType: "owners",
    level,
    createdAt: "",
    updatedAt: "",
    chainingOperator: chainingOperator ?? null,
    ...(chainingOperator ? { target: null, operator: null, value: null, valueType: null } : condition),
  };
}

describe("SiblingMerge.mergeRequirements", () => {
  test("keeps a sibling's row under a missing level and its group where no level held shares their first segment", () => {
    const own = [rowOf("w1", "winner", "1"), rowOf("w2", "winner", "2")];
    // A row under a missing level ("3.1", no "3"), and a group with one row under it
    const sibling = [rowOf("s1", "sibling", "3.1"), rowOf("s2", "sibling", "4", "or"), rowOf("s3", "sibling", "4.1")];
    const merged = SiblingMerge.mergeRequirements(own, [sibling], "winner");
    expect(merged.map(({ id, entityId, level }) => ({ id, entityId, level }))).toEqual([
      { id: "s1", entityId: "winner", level: "3.1" },
      { id: "s2", entityId: "winner", level: "4" },
      { id: "s3", entityId: "winner", level: "4.1" },
    ]);
  });

  test("puts a sibling's group past the winner's row under a missing level", () => {
    const own = [rowOf("w1", "winner", "1"), rowOf("w2", "winner", "2.1")];
    const sibling = [rowOf("s1", "sibling", "1", "and"), rowOf("s2", "sibling", "1.1")];
    expect(mergeOf(own, sibling)).toEqual({
      levels: { w1: "1", w2: "2.1", s1: "3", s2: "3.1" },
      roots: ["w1", "w2", "s1"],
      detached: [],
    });
  });

  test("keeps a sibling's row under a missing level a top-level row beside the winner's group at that level", () => {
    const own = [rowOf("w1", "winner", "3", "or"), rowOf("w2", "winner", "3.1")];
    const merged = mergeOf(own, [rowOf("s1", "sibling", "3.1")]);
    expect(merged).toEqual({ levels: { w1: "3", w2: "3.1", s1: "4" }, roots: ["w1", "s1"], detached: [] });
  });

  test("leaves the winner's row under a missing level in its tree beside a sibling's condition at that level", () => {
    const own = [rowOf("w1", "winner", "3.1")];
    const merged = mergeOf(own, [rowOf("s1", "sibling", "3")]);
    expect(merged).toEqual({ levels: { w1: "3.1", s1: "4" }, roots: ["w1", "s1"], detached: [] });
  });

  test("gives a sibling's condition at a level the winner holds a fresh top level", () => {
    const merged = mergeOf([rowOf("w1", "winner", "1")], [rowOf("s1", "sibling", "1"), rowOf("s2", "sibling", "2")]);
    expect(merged).toEqual({ levels: { w1: "1", s1: "2", s2: "3" }, roots: ["w1", "s1", "s2"], detached: [] });
  });
});

describe("SiblingMerge.mergeValues", () => {
  // What both copied: the flag set, a count of 2
  const source = held({ COUNT: [2], FLAG: [true] });
  // The winner set its flag back to false, which no row holds, and kept the count; its sibling kept the flag and
  // changed the count
  const winner = held({ COUNT: [2] });
  const sibling = held({ COUNT: [3], FLAG: [true] });

  test("takes a single value from the first copy that changed it from what it copied, its default among them", () => {
    const sources = { own: source, siblings: [source] };
    expect(SiblingMerge.mergeValues(winner, [sibling], "owners", COPY_FIELDS, sources)).toEqual({
      taken: [held({ COUNT: [3] })],
      values: held({ COUNT: [3] }),
    });
  });

  test("takes the winner's, else its first sibling's that holds one, from copies that copied nothing (a reprint)", () => {
    expect(SiblingMerge.mergeValues(winner, [sibling], "owners", COPY_FIELDS).values).toEqual(
      held({ COUNT: [2], FLAG: [true] }),
    );
  });
});
