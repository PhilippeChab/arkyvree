import { describe, expect, test } from "bun:test";

import { formatActivityDetails, formatNotificationMessage } from "@/client/src/lib/activityFormatters.ts";
import type { RulesDescriptions } from "@/client/src/lib/queries.ts";

/** A change to a list of links, its one entry at a tier. */
function linksAt(tier: number) {
  return {
    changedFields: [{ role: "listedIn", label: "Lists", added: [{ toId: "a", toName: "Arcane", tier }], removed: [] }],
  };
}

/** What an activity is formatted by of a made-up ruleset's rules: an owned kind, with its word for its position. */
function rulesWith(position?: { many: string; one: string }) {
  const rank = { many: "Guild Ranks", one: "Guild Rank", ...(position && { position }) };
  return {
    "Made-up Rules": {
      customizationPages: [{ owner: "guilds", type: "guild-ranks" }],
      fields: {},
      kinds: [],
      tiers: [{ label: "First Circle", tier: 1 }],
      tierWord: { many: "Circles", one: "Circle" },
      words: { "guild-ranks": rank, guilds: { many: "Guilds", one: "Guild" }, items: { many: "Items", one: "Item" } },
    },
  } as unknown as RulesDescriptions;
}

describe("An activity on an owned entity", () => {
  test("notifies in its rules' word for its position", () => {
    const data = { actorName: "Ann", entityName: "Thieves" };
    const rules = rulesWith({ many: "Circles", one: "Circle" });
    expect([
      formatNotificationMessage("createGuildRank", data, rules),
      formatNotificationMessage("updateGuildRank", data, rules),
      formatNotificationMessage("deleteGuildRank", data, rules),
    ]).toEqual([
      "Ann added a circle to Thieves",
      "Ann updated a circle of Thieves",
      "Ann removed a circle from Thieves",
    ]);
  });

  test("notifies a word that starts with a vowel with its own article", () => {
    const rules = rulesWith({ many: "Orders", one: "Order" });
    expect(formatNotificationMessage("createGuildRank", { actorName: "Ann", entityName: "Thieves" }, rules)).toBe(
      "Ann added an order to Thieves",
    );
  });

  test("names its position by its rules' word, else by its type's own", () => {
    expect(
      formatActivityDetails("updateGuildRank", { position: 2 }, rulesWith({ many: "Circles", one: "Circle" })),
    ).toBe("Circle 2");
    expect(formatActivityDetails("updateGuildRank", { position: 2 }, rulesWith())).toBe("Guild Rank 2");
  });

  test("names a position an activity of another type records in that type's word, never another type's", () => {
    expect(formatActivityDetails("updateItem", { position: 2 }, rulesWith({ many: "Circles", one: "Circle" }))).toBe(
      "Item 2",
    );
  });

  test("names its position by its type before its rules are in, never in a ruleset's word", () => {
    expect(formatActivityDetails("updateGuildRank", { position: 2 })).toBe("Guild Rank 2");
    expect(formatActivityDetails("updateWidget", { position: 2 })).toBe("Widget 2");
  });

  test("reads an older row's position at its old key, where the migration left it", () => {
    expect(formatActivityDetails("updateGuildRank", { level: 2 }, rulesWith())).toBe("Guild Rank 2");
  });
});

describe("An activity's list entry", () => {
  test("names its tier as its rules do, and one they don't list in their word for one", () => {
    const rules = rulesWith();
    expect(formatActivityDetails("updateItem", linksAt(1), rules)).toBe("Lists: added Arcane (First Circle)");
    expect(formatActivityDetails("updateItem", linksAt(3), rules)).toBe("Lists: added Arcane (Circle 3)");
    expect(formatActivityDetails("updateItem", linksAt(3))).toBe("Lists: added Arcane (Tier 3)");
  });
});
