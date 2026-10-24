/** The client's labels off a ruleset's words, any ruleset's: their words are their rules', never the client's. */

import { describe, expect, test } from "bun:test";

import { formatActivityType, formatNotificationMessage } from "@/client/src/lib/activityFormatters.ts";
import type { RulesDescriptions } from "@/client/src/lib/queries.ts";
import { getActivityLabelOverrides } from "@/client/src/lib/rulesetLabels.ts";

/** A ruleset whose perks are talents, and whose owner levels are as they're spelled */
const WORDS = { perks: { one: "Talent", many: "Talents" }, owner_levels: { one: "Owner Level", many: "Owner Levels" } };
const RULES = {
  "Some Rules": { words: WORDS, customizationPages: [], kinds: [], columns: {} },
} as unknown as RulesDescriptions;

describe("An activity", () => {
  test("names a type its ruleset words its own way by that word, and none other", () => {
    expect(getActivityLabelOverrides(WORDS)).toEqual({ Perk: "Talent" });
    expect(getActivityLabelOverrides(undefined)).toEqual({});
  });

  test("is labelled in its ruleset's words, an older one's (no base rules in its data) by every rules'", () => {
    expect([
      formatActivityType("createPerk", { entityName: "Brawn" }, RULES),
      formatActivityType("updateOwnerLevel", {}, RULES),
      formatActivityType("createPerk", { entityName: "Brawn" }),
    ]).toEqual(["Create Talent: Brawn", "Update Owner Level", "Create Perk: Brawn"]);
    expect(formatNotificationMessage("deletePerk", { actorName: "Ann", entityName: "Brawn" }, RULES)).toBe(
      "Ann deleted talent Brawn",
    );
  });
});
