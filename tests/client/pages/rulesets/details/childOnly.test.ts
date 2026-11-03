import { describe, expect, test } from "bun:test";

import { childOnlyOf } from "@/client/src/pages/rulesets/details/childOnly.ts";

/** A ruleset's answer, as `childOnlyOf` reads it: its kind and whether its reader views its changes. */
function answer(kind: string, canViewChanges: boolean) {
  return { kind, permissions: { canViewChanges } };
}

describe("childOnlyOf", () => {
  test("opens an extension on its own entities, a fork on all of them, whose changes its reader views", () => {
    expect([childOnlyOf(answer("extension", true)), childOnlyOf(answer("ruleset", true))]).toEqual([true, false]);
  });

  test("follows its reader's pick, either way", () => {
    expect([childOnlyOf(answer("ruleset", true), "true"), childOnlyOf(answer("extension", true), "false")]).toEqual([
      true,
      false,
    ]);
  });

  test("never lists its own entities alone to a reader who doesn't view its changes, an extension's or by a link", () => {
    expect([childOnlyOf(answer("extension", false)), childOnlyOf(answer("ruleset", false), "true")]).toEqual([
      false,
      false,
    ]);
  });
});
