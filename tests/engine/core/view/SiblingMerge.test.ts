import { describe, expect, test } from "bun:test";

import { SiblingMerge } from "@/engine/core/view/index.ts";
import type { Requirement } from "@/shared/relations.ts";

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
  test("puts a sibling's group past a row under a missing level, which none of its rows meets or adopts", () => {
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
    const levels = SiblingMerge.mergeRequirements(own, [sibling], "winner").map((row) => row.level);
    expect(levels).toEqual(["3", "3.1"]);
  });
});
