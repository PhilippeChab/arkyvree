import { expect, test } from "bun:test";

import { getActivityName, isNavigableTarget } from "@/shared/activity.ts";

test("an activity about an account, a session or a linked sign-in has no page to open, any other its target's", () => {
  expect(isNavigableTarget("users")).toBe(false);
  expect(isNavigableTarget("sessions")).toBe(false);
  expect(isNavigableTarget("oauth_accounts")).toBe(false);
  expect(isNavigableTarget("rulesets")).toBe(true);
  expect(isNavigableTarget("klass_levels")).toBe(true);
});

test("an entity type's activities name it by its table's singular, in PascalCase", () => {
  expect(
    ["feats", "klasses", "klass_levels", "abilities", "races", "powers", "mechanics"].map((type) =>
      getActivityName(type),
    ),
  ).toEqual(["Feat", "Klass", "KlassLevel", "Ability", "Race", "Power", "Mechanic"]);
});
