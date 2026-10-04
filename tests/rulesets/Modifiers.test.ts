import { describe, expect, test } from "bun:test";

import DetailedCharacterModifiers from "@/server/rulesets/universal/DetailedCharacterModifiers.ts";
import type { Modifier } from "@/shared/relations.ts";

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

/** Evaluates a modifier on a target holding `value`; returns what the target ends with, and what was recorded. */
function evaluate(applied: Modifier, value: number) {
  const target = { misc: value };
  const modifiers = new DetailedCharacterModifiers({
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

describe("DetailedCharacterModifiers", () => {
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

  test("skips a template value that isn't a finite number, saying so", () => {
    expect(evaluate(modifier({ operator: "add", value: "{{ min() }}" }), 5)).toEqual({
      value: 5,
      applied: 0,
      skipped: ["Template resolved to a non-finite number (Infinity)"],
    });
  });
});
