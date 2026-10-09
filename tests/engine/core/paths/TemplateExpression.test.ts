import { describe, expect, test } from "bun:test";

import TemplateExpression from "@/engine/core/paths/TemplateExpression.ts";
import type { Components, TargetPathsTraverser, TraversePathResult } from "@/engine/core/types.ts";

const components = {} as Components;

/** Minimal stub components + traverser that knows a small fixed path tree. */
const tree: Record<string, number | string> = {
  "classes.druid.level": 5,
  "classes.ranger.level": 3,
  "classes.paladin.level": 5,
  "classes.cavalier.level": 2,
  "classes.beastmaster.level": 1,
  "classes.hexblade.level": 2,
  "abilities.charisma.modifier": -1,
  "identity.physiology.name": "Aldric",
};
const traverser: TargetPathsTraverser = {
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

describe("templateExpression", () => {
  test("plain bare path", () => {
    expect(TemplateExpression.evaluate("classes.druid.level", components, traverser)).toBe(5);
  });

  test("plain bracketed path", () => {
    expect(TemplateExpression.evaluate("[classes.druid.level]", components, traverser)).toBe(5);
  });

  test("string path", () => {
    expect(TemplateExpression.evaluate("identity.physiology.name", components, traverser)).toBe("Aldric");
  });

  test("number literal", () => {
    expect(TemplateExpression.evaluate("42", components, traverser)).toBe(42);
  });

  test("simple division (Ranger half)", () => {
    expect(TemplateExpression.evaluate("floor([classes.ranger.level] / 2)", components, traverser)).toBe(1);
  });

  test("addition with offset (Beastmaster +3)", () => {
    expect(TemplateExpression.evaluate("max(0, [classes.beastmaster.level] + 3)", components, traverser)).toBe(4);
  });

  test("subtraction with clamp (Hexblade -3)", () => {
    expect(TemplateExpression.evaluate("max(0, [classes.hexblade.level] - 3)", components, traverser)).toBe(0);
  });

  test("nested function calls", () => {
    expect(TemplateExpression.evaluate("min(max(1, [classes.ranger.level]), 10)", components, traverser)).toBe(3);
    expect(TemplateExpression.evaluate("min(max(1, [classes.beastmaster.level]), 10)", components, traverser)).toBe(1);
  });

  test("operator precedence: * before +", () => {
    // 2 * 3 + 1 = 7, not 8
    expect(TemplateExpression.evaluate("2 * 3 + 1", components, traverser)).toBe(7);
  });

  test("parens override precedence", () => {
    expect(TemplateExpression.evaluate("2 * (3 + 1)", components, traverser)).toBe(8);
  });

  test("unary minus", () => {
    expect(TemplateExpression.evaluate("-5 + [classes.druid.level]", components, traverser)).toBe(0);
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

  test("unresolvable path returns null", () => {
    expect(TemplateExpression.evaluate("[classes.bard.level]", components, traverser)).toBeNull();
  });

  test("unknown function returns null", () => {
    expect(TemplateExpression.evaluate("sqrt([classes.druid.level])", components, traverser)).toBeNull();
  });

  test("string in arithmetic context returns null", () => {
    expect(TemplateExpression.evaluate("[identity.physiology.name] + 1", components, traverser)).toBeNull();
  });

  // Injection / safety
  test("constructor (inherited prototype method) is not callable", () => {
    expect(TemplateExpression.evaluate("constructor(1)", components, traverser)).toBeNull();
  });

  test("__proto__ as a function name is not callable", () => {
    expect(TemplateExpression.evaluate("__proto__(1)", components, traverser)).toBeNull();
  });

  test("valueOf / toString are not callable", () => {
    expect(TemplateExpression.evaluate("valueOf()", components, traverser)).toBeNull();
    expect(TemplateExpression.evaluate("toString()", components, traverser)).toBeNull();
  });

  test("hasOwnProperty is not callable", () => {
    expect(TemplateExpression.evaluate("hasOwnProperty(1)", components, traverser)).toBeNull();
  });

  test("path with garbage chars inside brackets fails gracefully", () => {
    expect(TemplateExpression.evaluate("[abilities.charisma); evil]", components, traverser)).toBeNull();
  });

  test("unterminated bracket fails to parse, no throw", () => {
    expect(TemplateExpression.evaluate("[unterminated", components, traverser)).toBeNull();
  });

  test("empty expression returns null", () => {
    expect(TemplateExpression.evaluate("", components, traverser)).toBeNull();
  });
});
