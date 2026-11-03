import { describe, expect, test } from "bun:test";

import { formatActivityDetails, formatNotificationMessage } from "@/client/src/lib/activityFormatters.ts";
import type { RulesDescriptions } from "@/client/src/lib/queries.ts";

/** A change to a list of links, its one entry at a tier. */
function linksAt(tier: number) {
  return {
    changedFields: [{ role: "listedIn", label: "Lists", added: [{ toId: "a", toName: "Arcane", tier }], removed: [] }],
  };
}

/** A made-up ruleset whose guilds' ranks count spells on a list, and whose guilds' rows open their progression. */
function rulesCountingSpells() {
  const [rules] = Object.values(rulesWith());
  return {
    "Made-up Rules": {
      ...rules,
      kinds: [{ opens: "progression", type: "guilds" }],
      progression: { counts: { type: "spells" } },
      words: { ...rules.words, spells: { many: "Spells", one: "Spell" } },
    },
  } as unknown as RulesDescriptions;
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

describe("An activity on an owner's list", () => {
  test("notifies the entities added, by name or by how many, and the one removed, by the list's name", () => {
    const rules = rulesCountingSpells();
    const added = { actorName: "Ann", entityName: "Thieves", listName: "Thief Spells", tier: 1 };
    expect([
      formatNotificationMessage("addGuildSpell", { ...added, toNames: ["Blur"] }, rules),
      formatNotificationMessage("addGuildSpell", { ...added, toNames: ["Blur", "Haste"] }, rules),
      formatNotificationMessage("removeGuildSpell", { ...added, toName: "Blur" }, rules),
      formatNotificationMessage("removeGuildSpell", { actorName: "Ann" }, rules),
    ]).toEqual([
      "Ann added Blur to Thief Spells",
      "Ann added 2 spells to Thief Spells",
      "Ann removed Blur from Thief Spells",
      "Ann removed a spell from a spell list",
    ]);
  });

  test("details the entities at their tier, as its rules name it", () => {
    const rules = rulesCountingSpells();
    expect(formatActivityDetails("addGuildSpell", { tier: 1, toNames: ["Blur", "Haste"] }, rules)).toBe(
      "First Circle: Blur, Haste",
    );
    expect(formatActivityDetails("removeGuildSpell", { tier: 3, toName: "Blur" }, rules)).toBe("Circle 3: Blur");
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
