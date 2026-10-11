import { expect, test } from "bun:test";

import { isNavigableTarget } from "@/shared/activity.ts";

test("an activity about an account or a session has no page to open, any other its target's", () => {
  expect(isNavigableTarget("users")).toBe(false);
  expect(isNavigableTarget("sessions")).toBe(false);
  expect(isNavigableTarget("rulesets")).toBe(true);
  expect(isNavigableTarget("klass_levels")).toBe(true);
});
