import { describe, expect, test } from "bun:test";
import { evaluateTemplateExpression } from "@/server/rulesets/universal/templateExpression.ts";
import type { Holders, TargetPathsTraverser, TraversePathResult } from "@/server/rulesets/types.ts";

// Minimal stub holders + traverser that knows a small fixed path tree.
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
  traversePathInit(path: string): TraversePathResult[] {
    if (!(path in tree)) {
      return [{ holder: null, object: null, data: null, key: path, resolvedPath: null, error: `Path "${path}" not found` }];
    }
    return [{ holder: null, object: null, data: tree[path], key: path, resolvedPath: path, error: undefined as unknown as string }];
  },
} as unknown as TargetPathsTraverser;
const holders = {} as Holders;

describe("templateExpression", () => {
  test("plain bare path", () => {
    expect(evaluateTemplateExpression("classes.druid.level", holders, traverser)).toBe(5);
  });

  test("plain bracketed path", () => {
    expect(evaluateTemplateExpression("[classes.druid.level]", holders, traverser)).toBe(5);
  });

  test("string path", () => {
    expect(evaluateTemplateExpression("identity.physiology.name", holders, traverser)).toBe("Aldric");
  });

  test("number literal", () => {
    expect(evaluateTemplateExpression("42", holders, traverser)).toBe(42);
  });

  test("simple division (Ranger half)", () => {
    expect(evaluateTemplateExpression("floor([classes.ranger.level] / 2)", holders, traverser)).toBe(1);
  });

  test("addition with offset (Beastmaster +3)", () => {
    expect(evaluateTemplateExpression("max(0, [classes.beastmaster.level] + 3)", holders, traverser)).toBe(4);
  });

  test("subtraction with clamp (Hexblade -3)", () => {
    expect(evaluateTemplateExpression("max(0, [classes.hexblade.level] - 3)", holders, traverser)).toBe(0);
  });

  test("nested function calls", () => {
    expect(evaluateTemplateExpression("min(max(1, [classes.ranger.level]), 10)", holders, traverser)).toBe(3);
    expect(evaluateTemplateExpression("min(max(1, [classes.beastmaster.level]), 10)", holders, traverser)).toBe(1);
  });

  test("operator precedence: * before +", () => {
    // 2 * 3 + 1 = 7, not 8
    expect(evaluateTemplateExpression("2 * 3 + 1", holders, traverser)).toBe(7);
  });

  test("parens override precedence", () => {
    expect(evaluateTemplateExpression("2 * (3 + 1)", holders, traverser)).toBe(8);
  });

  test("unary minus", () => {
    expect(evaluateTemplateExpression("-5 + [classes.druid.level]", holders, traverser)).toBe(0);
  });

  test("division by zero returns null", () => {
    expect(evaluateTemplateExpression("[classes.druid.level] / 0", holders, traverser)).toBeNull();
  });

  test("unresolvable path returns null", () => {
    expect(evaluateTemplateExpression("[classes.bard.level]", holders, traverser)).toBeNull();
  });

  test("unknown function returns null", () => {
    expect(evaluateTemplateExpression("sqrt([classes.druid.level])", holders, traverser)).toBeNull();
  });

  test("string in arithmetic context returns null", () => {
    expect(evaluateTemplateExpression("[identity.physiology.name] + 1", holders, traverser)).toBeNull();
  });

  // Injection / safety
  test("constructor (inherited prototype method) is not callable", () => {
    expect(evaluateTemplateExpression("constructor(1)", holders, traverser)).toBeNull();
  });

  test("__proto__ as a function name is not callable", () => {
    expect(evaluateTemplateExpression("__proto__(1)", holders, traverser)).toBeNull();
  });

  test("valueOf / toString are not callable", () => {
    expect(evaluateTemplateExpression("valueOf()", holders, traverser)).toBeNull();
    expect(evaluateTemplateExpression("toString()", holders, traverser)).toBeNull();
  });

  test("hasOwnProperty is not callable", () => {
    expect(evaluateTemplateExpression("hasOwnProperty(1)", holders, traverser)).toBeNull();
  });

  test("path with garbage chars inside brackets fails gracefully", () => {
    expect(evaluateTemplateExpression("[abilities.charisma); evil]", holders, traverser)).toBeNull();
  });

  test("unterminated bracket fails to parse, no throw", () => {
    expect(evaluateTemplateExpression("[unterminated", holders, traverser)).toBeNull();
  });

  test("empty expression returns null", () => {
    expect(evaluateTemplateExpression("", holders, traverser)).toBeNull();
  });
});
