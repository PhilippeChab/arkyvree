import { describe, expect, test } from "bun:test";

import {
  extractTemplateExpression,
  extractTemplatePath,
  findTemplateError,
  isTemplateValue,
} from "@/shared/customization/templateExpression.ts";

/** The paths a template of some ruleset reads, by type: its "template" listing. */
const READABLE = new Map([
  ["stats.presence.modifier", "number"],
  ["tracks.scout.level", "number"],
  ["identity.physiology.name", "string"],
  ["perks.dodge.possessed", "boolean"],
]);

describe("A template value", () => {
  test("is a non-empty {{ expression }}", () => {
    expect(["{{ stats.might.modifier }}", "{{x}}", "{{ }}", "3", "{{ a }} + 1"].map(isTemplateValue)).toEqual([
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
        "{{ stats.presence.modifier }}",
        "{{ [stats.presence.modifier] }}",
        "{{ a.b + 1 }}",
        "{{ max(a, b) }}",
        "a.b",
      ].map(extractTemplatePath),
    ).toEqual(["stats.presence.modifier", "stats.presence.modifier", null, null, null]);
  });
});

describe("A template's error", () => {
  test("is none for what the sheet can evaluate: a path of the target's type, or an expression of readable numbers", () => {
    expect(
      [
        ["floor([tracks.scout.level] / 2)", "number"],
        ["max(0, min([stats.presence.modifier], [tracks.scout.level]) + 3)", "number"],
        ["-[stats.presence.modifier]", "number"],
        ["[identity.physiology.name]", "string"],
        ["perks.dodge.possessed", "boolean"],
      ].map(([expression, type]) => findTemplateError(expression, READABLE, type)),
    ).toEqual([null, null, null, null, null]);
  });

  test("says what the sheet would refuse, each the way it would", () => {
    expect(
      [
        ["floor([tracks.scout.level] / 2", "number"],
        ["round([tracks.scout.level])", "number"],
        ["[tracks.scuot.level] + 1", "number"],
        ["[stats.*.modifier]", "number"],
        ["[identity.physiology.name] + 1", "number"],
        ["[identity.physiology.name]", "number"],
        ["[tracks.scout.level] + 1", "string"],
        ["constructor(1)", "number"],
      ].map(([expression, type]) => findTemplateError(expression, READABLE, type)),
    ).toEqual([
      'Failed to parse template "floor([tracks.scout.level] / 2": Expected )',
      'Unknown function "round"',
      "tracks.scuot.level isn't a path a template can read",
      "stats.*.modifier isn't a path a template can read",
      "identity.physiology.name is a string: arithmetic takes numbers",
      "identity.physiology.name is a string, not a number",
      "An expression computes a number, not a string",
      'Unknown function "constructor"',
    ]);
  });
});
