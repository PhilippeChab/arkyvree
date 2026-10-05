import { describe, expect, test } from "bun:test";

import type { TraversePathResult } from "@/server/rulesets/types.ts";
import DetailedCharacterRequirements from "@/server/rulesets/universal/DetailedCharacterRequirements.ts";
import type { Requirement } from "@/shared/relations.ts";

function requirement(values: Partial<Requirement> = {}): Requirement {
  const now = new Date().toISOString();
  return {
    id: "req-1",
    entityId: "entity-1",
    entityType: "feats",
    level: "1",
    target: "feats.weaponfocus.*.possessed",
    operator: "equal",
    value: "true",
    valueType: "boolean",
    chainingOperator: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...values,
  };
}

/** A path's value, or its error. */
function result(data: unknown, error: string | null = null): TraversePathResult {
  return {
    holder: error ? null : {},
    object: error ? null : { key: data },
    data,
    key: "possessed",
    resolvedPath: error ? null : "feats.test.possessed",
    error,
  };
}

/** Evaluates one group of requirements, each path resolving as `resolve` says. */
function evaluate(group: Requirement[], resolve: (target: string) => TraversePathResult[]) {
  const evaluator = new DetailedCharacterRequirements({
    readsSource: () => false,
    traversePathInit: (target) => resolve(target),
  });
  evaluator.evaluateRequirements({}, [group]);
  const { fulfilledRequirementGroups, unmetRequirementGroups, invalidRequirements } = evaluator.getRequirements();
  return {
    fulfilled: fulfilledRequirementGroups.length,
    unmet: unmetRequirementGroups.length,
    invalid: invalidRequirements.map((r) => r.warning),
  };
}

const met = { fulfilled: 1, unmet: 0 };
const unmet = { fulfilled: 0, unmet: 1 };

describe("DetailedCharacterRequirements", () => {
  // A wildcard target resolves to several values: any of them meeting the requirement is enough.
  test.each([
    ["one value that meets it", {}, [true], met],
    ["one value that doesn't", {}, [false], unmet],
    ["a wildcard with one match among several", {}, [false, true, false], met],
    ["a wildcard without a match", {}, [false, false, false], unmet],
    ["a wildcard that reaches nothing", {}, [], unmet],
    ["a feat required absent, and absent", { value: "false" }, [false], met],
    ["a feat required absent, but had", { value: "false" }, [true], unmet],
    [
      "a wildcard over numbers, one above the bar",
      { target: "powers.groups.evocation.*.dc.total", operator: "greater_than", value: "15", valueType: "number" },
      [14, 16, 13],
      met,
    ],
    [
      "a feat taken often enough",
      { target: "feats.toughness.count", operator: "greater_than_or_equal", value: "2", valueType: "number" },
      [3],
      met,
    ],
    [
      "a feat not taken often enough",
      { target: "feats.toughness.count", operator: "greater_than_or_equal", value: "3", valueType: "number" },
      [1],
      unmet,
    ],
  ] as const)("judges %s", (_, values, data, expected) => {
    expect(evaluate([requirement(values as Partial<Requirement>)], () => data.map((d) => result(d)))).toMatchObject(
      expected,
    );
  });

  test("reports paths that don't resolve, judging the rest of a wildcard without them", () => {
    expect(evaluate([requirement()], () => [result(null, "Element not found: badpath"), result(true)])).toEqual({
      ...met,
      invalid: ["Element not found: badpath"],
    });
    expect(
      evaluate([requirement()], () => [result(null, "Element not found: x"), result(null, "Element not found: y")])
        .invalid,
    ).toHaveLength(2);
  });

  test("reports a value that isn't of its type: a boolean is true or false, a number not empty", () => {
    expect(evaluate([requirement({ value: "yes" })], () => [result(true)])).toEqual({
      ...unmet,
      invalid: ['Invalid boolean value: "yes"'],
    });
    const count = { target: "feats.toughness.count", operator: "equal", value: "", valueType: "number" } as const;
    expect(evaluate([requirement(count)], () => [result(0)])).toEqual({
      ...unmet,
      invalid: ['Invalid number value: ""'],
    });
  });

  test("combines a wildcard with the rest of its group", () => {
    const fighterLevel = requirement({
      id: "req-2",
      level: "2",
      target: "classes.fighter.level",
      operator: "greater_than_or_equal",
      value: "1",
      valueType: "number",
    });
    expect(
      evaluate([requirement(), fighterLevel], (target) =>
        target.includes("*") ? [result(false), result(true)] : [result(3)],
      ),
    ).toMatchObject(met);
  });

  describe("with a value computed from another path", () => {
    test.each([
      ["equal levels", "{{ [classes.fighter.level] }}", 5, 5, met],
      ["a lower level", "{{ [classes.fighter.level] }}", 3, 5, unmet],
      ["arithmetic: half the other level, rounded down", "{{ floor([classes.fighter.level] / 2) }}", 4, 6, met],
      // Older values wrote the path without brackets.
      ["a bare path", "{{ classes.fighter.level }}", 5, 5, met],
      ["a path that doesn't resolve", "{{ [classes.bard.level] }}", 5, 5, unmet],
      ["a value that divides by zero", "{{ [classes.fighter.level] / 0 }}", 5, 5, unmet],
    ] as const)("judges %s", (_, value, druid, fighter, expected) => {
      const resolve = (target: string) => {
        if (target === "classes.druid.level") return [result(druid)];
        if (target === "classes.fighter.level") return [result(fighter)];
        return [result(null, `Element not found: ${target}`)];
      };
      expect(
        evaluate(
          [
            requirement({
              target: "classes.druid.level",
              operator: "greater_than_or_equal",
              value,
              valueType: "number",
            }),
          ],
          resolve,
        ),
      ).toMatchObject(expected);
    });

    test("says a value that divides by zero is invalid", () => {
      const level = requirement({
        target: "classes.druid.level",
        operator: "greater_than_or_equal",
        value: "{{ [classes.fighter.level] / 0 }}",
        valueType: "number",
      });
      expect(evaluate([level], () => [result(5)]).invalid).toEqual([
        'Template "[classes.fighter.level] / 0" divides by zero',
      ]);
    });
  });
});
