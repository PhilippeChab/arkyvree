import { expect, test } from "bun:test";

import { getActivityName, isNavigableTarget } from "@/shared/activity.ts";

test("an activity about an account, a session or a linked sign-in has no page to open, any other its target's", () => {
  expect(isNavigableTarget("users")).toBe(false);
  expect(isNavigableTarget("sessions")).toBe(false);
  expect(isNavigableTarget("oauth_accounts")).toBe(false);
  expect(isNavigableTarget("rulesets")).toBe(true);
  expect(isNavigableTarget("compass_points")).toBe(true);
});

test("an entity type's activities name it by its table's singular, in PascalCase", () => {
  expect(
    ["perks", "compasses", "compass_points", "stories", "traces", "gadgets", "mechanics"].map((type) =>
      getActivityName(type),
    ),
  ).toEqual(["Perk", "Compass", "CompassPoint", "Story", "Trace", "Gadget", "Mechanic"]);
});
