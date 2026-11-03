import { expect, test } from "bun:test";

import { getActivityName, isNavigableTarget } from "@/shared/activity.ts";

test("an activity about an account, a session or a linked sign-in has no page to open, any other its target's", () => {
  expect(isNavigableTarget("users")).toBe(false);
  expect(isNavigableTarget("sessions")).toBe(false);
  expect(isNavigableTarget("oauth-accounts")).toBe(false);
  expect(isNavigableTarget("rulesets")).toBe(true);
  expect(isNavigableTarget("compass-points")).toBe(true);
});

test("an entity type's activities name it by its type's singular, its words in PascalCase", () => {
  expect(
    ["perks", "compasses", "compass-points", "stories", "traces", "gadgets", "schematics"].map((type) =>
      getActivityName(type),
    ),
  ).toEqual(["Perk", "Compass", "CompassPoint", "Story", "Trace", "Gadget", "Schematic"]);
});
