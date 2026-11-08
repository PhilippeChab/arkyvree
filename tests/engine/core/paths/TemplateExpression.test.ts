import { describe, expect, test } from "bun:test";

import type { TargetPathsTraverser } from "@/engine/core/paths/CategoryPaths.ts";
import type { Components, TraversePathResult } from "@/engine/core/paths/PathTraverser.ts";
import TemplateExpression from "@/engine/core/paths/TemplateExpression.ts";

const components = {} as Components;

/** Minimal stub components + traverser that knows a small fixed path tree. */
const tree: Record<string, number | string> = {
  "classes.druid.level": 5,
  "classes.ranger.level": 3,
  "classes.paladin.level": 5,
  "classes.cavalier.level": 2,
  "classes.beastmaster.level": 1,
  "classes.hexblade.level": 2,
  "stats.presence.modifier": -1,
  "identity.physiology.name": "Aldric",
};
const traverser: TargetPathsTraverser = {
  findGrantError: () => undefined,
  readsSource: () => false,
  traversePathInit(path: string): TraversePathResult[] {
    if (!(path in tree)) {
      return [
        { component: null, object: null, data: null, key: path, resolvedPath: null, error: `Path "${path}" not found` },
      ];
    }
    return [
      {
        component: null,
        object: null,
        data: tree[path],
        key: path,
        resolvedPath: path,
        error: undefined as unknown as string,
      },
    ];
  },
} as unknown as TargetPathsTraverser;

/** What `expression` evaluates to on the stub tree, beside it: a failure names the expression. */
function evaluated(expression: string) {
  return { expression, value: TemplateExpression.evaluate(expression, components, traverser) };
}

describe("templateExpression", () => {
  test("evaluates a path, bare or bracketed, a number, and arithmetic over them, its functions and precedence", () => {
    const cases: [string, number | string][] = [
      ["classes.druid.level", 5],
      ["[classes.druid.level]", 5],
      ["identity.physiology.name", "Aldric"],
      ["42", 42],
      // A ranger's half, a beastmaster's +3, a hexblade's −3 clamped, nested calls
      ["floor([classes.ranger.level] / 2)", 1],
      ["max(0, [classes.beastmaster.level] + 3)", 4],
      ["max(0, [classes.hexblade.level] - 3)", 0],
      ["min(max(1, [classes.ranger.level]), 10)", 3],
      ["min(max(1, [classes.beastmaster.level]), 10)", 1],
      // * before +, parentheses over it, a unary minus
      ["2 * 3 + 1", 7],
      ["2 * (3 + 1)", 8],
      ["-5 + [classes.druid.level]", 0],
    ];
    for (const [expression, value] of cases) expect(evaluated(expression)).toEqual({ expression, value });
  });

  test("division by zero returns null, and says so", () => {
    const warnings: string[] = [];
    expect(
      TemplateExpression.evaluate("[classes.druid.level] / 0", components, traverser, (warning) =>
        warnings.push(warning),
      ),
    ).toBeNull();
    expect(warnings).toEqual(['Template "[classes.druid.level] / 0" divides by zero']);
  });

  test("returns null, never throwing, for what it can't evaluate: a path, a function, text in arithmetic, bad syntax", () => {
    for (const expression of [
      "[classes.bard.level]",
      "sqrt([classes.druid.level])",
      "[identity.physiology.name] + 1",
      "[stats.presence); evil]",
      "[unterminated",
      "",
    ])
      expect(evaluated(expression)).toEqual({ expression, value: null });
  });

  // Injection / safety
  test("calls no method a plain object inherits", () => {
    for (const expression of ["constructor(1)", "__proto__(1)", "valueOf()", "toString()", "hasOwnProperty(1)"])
      expect(evaluated(expression)).toEqual({ expression, value: null });
  });
});
