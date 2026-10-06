import { describe, expect, test } from "bun:test";

import ModifierEvaluator from "@/server/rulesets/engine/modifiers/ModifierEvaluator.ts";
import type { Modifier } from "@/shared/relations.ts";

/** Evaluates a modifier on a target holding `value`; returns what the target ends with, and what was recorded. */
function evaluate(applied: Modifier, value: number | boolean | string[]) {
  const target = { misc: value };
  const modifiers = new ModifierEvaluator({
    readsSource: () => false,
    traversePathInit: () => [
      { holder: {}, object: target, data: target.misc, key: "misc", resolvedPath: applied.target, error: null },
    ],
  });
  modifiers.evaluateModifier(applied, {});
  const { appliedModifiers, skippedModifiers } = modifiers.getModifiers();
  return {
    value: target.misc,
    applied: appliedModifiers.length,
    skipped: skippedModifiers.map((skip) => skip.warning),
  };
}

function modifier(values: Partial<Modifier> = {}): Modifier {
  const now = new Date().toISOString();
  return {
    id: "modifier-1",
    sourceId: "feat-1",
    sourceType: "feats",
    target: "abilities.strength.misc",
    operator: "add",
    value: "1",
    valueType: "number",
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...values,
  };
}

describe("ModifierEvaluator", () => {
  test("applies a template value", () => {
    expect(evaluate(modifier({ operator: "divide", value: "{{ 4 / 2 }}" }), 6)).toEqual({
      value: 3,
      applied: 1,
      skipped: [],
    });
  });

  test("skips a template value that divides by zero, saying so", () => {
    expect(evaluate(modifier({ operator: "divide", value: "{{ 1 / 0 }}" }), 5)).toEqual({
      value: 5,
      applied: 0,
      skipped: ['Template "1 / 0" divides by zero'],
    });
  });

  test("adds a value to a list and takes one from it: a spell's descriptors", () => {
    const descriptor = { valueType: "string", target: "powers.fear.properties.SPELL_DESCRIPTOR" } as const;
    expect(evaluate(modifier({ ...descriptor, operator: "add", value: "Evil" }), ["Fear", "Mind-Affecting"])).toEqual({
      value: ["Fear", "Mind-Affecting", "Evil"],
      applied: 1,
      skipped: [],
    });
    expect(
      evaluate(modifier({ ...descriptor, operator: "subtract", value: "Fear" }), ["Fear", "Mind-Affecting"]),
    ).toEqual({
      value: ["Mind-Affecting"],
      applied: 1,
      skipped: [],
    });
    expect(evaluate(modifier({ target: descriptor.target }), ["Fear"])).toEqual({
      value: ["Fear"],
      applied: 0,
      skipped: ["Value type mismatch: expected number, got object"],
    });
  });

  test("sets a boolean written false to false", () => {
    expect(evaluate(modifier({ operator: "set", value: "false", valueType: "boolean" }), true)).toEqual({
      value: false,
      applied: 1,
      skipped: [],
    });
  });

  test.each([
    [
      "a boolean neither true nor false",
      { operator: "set", value: "yes", valueType: "boolean" },
      true,
      ['Invalid boolean value: "yes"'],
    ],
    ["a number that doesn't parse", { value: "abc" }, 5, ['Invalid number value: "abc"']],
    ["an empty number", { value: "" }, 5, ['Invalid number value: ""']],
    ["a division by zero", { operator: "divide", value: "0" }, 5, ["Divides by zero"]],
  ] as const)("skips %s, saying so", (_, values, value, skipped) => {
    expect(evaluate(modifier(values), value)).toEqual({ value, applied: 0, skipped: [...skipped] });
  });

  test("skips a template value that isn't a finite number, saying so", () => {
    expect(evaluate(modifier({ operator: "add", value: "{{ min() }}" }), 5)).toEqual({
      value: 5,
      applied: 0,
      skipped: ["Template resolved to a non-finite number (Infinity)"],
    });
  });
});
