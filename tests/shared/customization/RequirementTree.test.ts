import { describe, expect, test } from "bun:test";

import RequirementTree, { compareLevels, getParentLevel } from "@/shared/customization/RequirementTree.ts";

/** A row at `level`: a group when it has an operator, a condition otherwise. */
function row(level: string, chainingOperator: string | null = null) {
  return { level, chainingOperator };
}

/** A tree's shape: each node's level, with its children's under it. */
function shape(nodes: RequirementTree<ReturnType<typeof row>>["roots"]): unknown[] {
  return nodes.map((node) =>
    node.children.length > 0 ? [node.requirement.level, shape(node.children)] : node.requirement.level,
  );
}

describe("compareLevels", () => {
  test("compares each segment, a number as a number, anything else as text, a level before the ones under it", () => {
    const levels = ["10", "1.10", "1-2", "2", "1.9", "1", "1.2.1", "1.2"];
    expect(levels.sort(compareLevels)).toEqual(["1", "1.2", "1.2.1", "1.9", "1.10", "1-2", "2", "10"]);
  });
});

describe("getParentLevel", () => {
  test("is the level without its last segment, none at the top", () => {
    expect(getParentLevel("1.2.3")).toBe("1.2");
    expect(getParentLevel("1")).toBeNull();
  });
});

describe("RequirementTree", () => {
  test("puts each row under its group, in level order, whatever the rows' order", () => {
    const rows = [row("2"), row("1.10"), row("1", "or"), row("1.2", "and"), row("1.9"), row("1.2.1"), row("1.2.2")];
    expect(shape(RequirementTree.fromRows(rows).roots)).toEqual([
      ["1", [["1.2", ["1.2.1", "1.2.2"]], "1.9", "1.10"]],
      "2",
    ]);
  });

  test("makes a row whose parent isn't among the rows a root", () => {
    expect(shape(RequirementTree.fromRows([row("3.1"), row("1")]).roots)).toEqual(["1", "3.1"]);
  });

  test("detaches each row under a condition, which groups nothing", () => {
    const tree = RequirementTree.fromRows([row("1"), row("1.1"), row("2", "or"), row("2.1"), row("1.1.1")]);
    expect(shape(tree.roots)).toEqual(["1", ["2", ["2.1"]]]);
    // "1.1.1" sits under "1.1", a condition too
    expect(tree.detached.map((r) => r.level)).toEqual(["1.1", "1.1.1"]);
  });

  test("keeps a level ending in .0 under its parent, as any other", () => {
    expect(shape(RequirementTree.fromRows([row("1", "and"), row("1.0"), row("1.1")]).roots)).toEqual([
      ["1", ["1.0", "1.1"]],
    ]);
  });

  test("keeps every row at a shared level, a row under it hanging from the first", () => {
    const tree = RequirementTree.fromRows([row("1", "and"), row("1"), row("1.1")]);
    expect(tree.roots.map((node) => node.requirement)).toEqual([row("1", "and"), row("1")]);
    expect(tree.roots[0].children.map((node) => node.requirement.level)).toEqual(["1.1"]);
  });

  test("holds no depth limit", () => {
    const levels = ["1", "1.1", "1.1.1", "1.1.1.1", "1.1.1.1.1", "1.1.1.1.1.1"];
    const tree = RequirementTree.fromRows(levels.map((level, i) => row(level, i < levels.length - 1 ? "and" : null)));
    let depth = 0;
    for (let node = tree.roots[0]; node; node = node.children[0]) depth++;
    expect(depth).toBe(levels.length);
  });
});
