import { describe, expect, test } from "bun:test";

import { authPagePath, authPageState } from "@/client/src/components/auth/authRedirect.ts";

describe("Where an auth page sends its user once signed in", () => {
  test("is carried along in its link's ?redirect=, encoded, or left out for the dashboard", () => {
    expect(authPagePath("/sign-in", "/campaigns/c1?tab=players")).toBe(
      "/sign-in?redirect=%2Fcampaigns%2Fc1%3Ftab%3Dplayers",
    );
    expect(authPagePath("/sign-up", null)).toBe("/sign-up");
  });

  test("is read from its router state, anything else in it ignored", () => {
    expect(authPageState({ from: "sign-in", redirect: "/rulesets", other: 1 })).toEqual({
      from: "sign-in",
      redirect: "/rulesets",
    });
    expect(authPageState({ from: "sign-up", redirect: 3 })).toEqual({});
    expect(authPageState(null)).toEqual({});
  });
});
