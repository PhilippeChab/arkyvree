import { describe, expect, test } from "bun:test";

import {
  extractTemplateExpression,
  extractTemplatePath,
  findTemplateError,
  isTemplateValue,
} from "@/shared/customization/templateExpression.ts";

/** The paths a template of some ruleset reads, by type: its "template" listing. */
const READABLE = new Map([
  ["abilities.charisma.modifier", "number"],
  ["classes.ranger.level", "number"],
  ["identity.physiology.name", "string"],
  ["feats.dodge.possessed", "boolean"],
]);

describe("A template value", () => {
  test("is a non-empty {{ expression }}", () => {
    expect(["{{ abilities.strength.modifier }}", "{{x}}", "{{ }}", "3", "{{ a }} + 1"].map(isTemplateValue)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    expect([extractTemplateExpression("{{ a + 1 }}"), extractTemplateExpression("3")]).toEqual(["a + 1", null]);
  });

  test("names a path when it's a single one, bracketed or not", () => {
    expect(
      [
        "{{ abilities.charisma.modifier }}",
        "{{ [abilities.charisma.modifier] }}",
        "{{ a.b + 1 }}",
        "{{ max(a, b) }}",
        "a.b",
      ].map(extractTemplatePath),
    ).toEqual(["abilities.charisma.modifier", "abilities.charisma.modifier", null, null, null]);
  });
});

describe("A template's error", () => {
  test("is none for what the sheet can evaluate: a path of the target's type, or an expression of readable numbers", () => {
    expect(
      [
        ["floor([classes.ranger.level] / 2)", "number"],
        ["max(0, min([abilities.charisma.modifier], [classes.ranger.level]) + 3)", "number"],
        ["-[abilities.charisma.modifier]", "number"],
        ["[identity.physiology.name]", "string"],
        ["feats.dodge.possessed", "boolean"],
      ].map(([expression, type]) => findTemplateError(expression, READABLE, type)),
    ).toEqual([null, null, null, null, null]);
  });

  test("says what the sheet would refuse, each the way it would", () => {
    expect(
      [
        ["floor([classes.ranger.level] / 2", "number"],
        ["round([classes.ranger.level])", "number"],
        ["[classes.rangr.level] + 1", "number"],
        ["[abilities.*.modifier]", "number"],
        ["[identity.physiology.name] + 1", "number"],
        ["[identity.physiology.name]", "number"],
        ["[classes.ranger.level] + 1", "string"],
        ["constructor(1)", "number"],
      ].map(([expression, type]) => findTemplateError(expression, READABLE, type)),
    ).toEqual([
      'Failed to parse template "floor([classes.ranger.level] / 2": Expected )',
      'Unknown function "round"',
      "classes.rangr.level isn't a path a template can read",
      "abilities.*.modifier isn't a path a template can read",
      "identity.physiology.name is a string: arithmetic takes numbers",
      "identity.physiology.name is a string, not a number",
      "An expression computes a number, not a string",
      'Unknown function "constructor"',
    ]);
  });
});
