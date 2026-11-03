import { describe, expect, test } from "bun:test";

import type { RulesWords } from "@/client/src/lib/queries.ts";
import { positionWordOf, positionWordsOf, withArticle } from "@/client/src/lib/rulesetLabels.ts";

/** A made-up ruleset's words: a kind its owner holds, whose position has a word of its own, and a kind with none. */
const WORDS: RulesWords = {
  "guild-ranks": { many: "Guild Ranks", one: "Guild Rank", position: { many: "Circles", one: "Circle" } },
  guilds: { many: "Guilds", one: "Guild" },
};

describe("An owned entity's position's word", () => {
  test("is its rules' word, in both its forms", () => {
    expect(positionWordsOf("guild-ranks", WORDS)).toEqual({ many: "Circles", one: "Circle" });
    expect(positionWordOf("guild-ranks", WORDS)).toBe("Circle");
  });

  test("is its type's own word, in both its forms, for a type its rules give no position", () => {
    expect(positionWordsOf("guilds", WORDS)).toEqual({ many: "Guilds", one: "Guild" });
    expect(positionWordOf("guilds", WORDS)).toBe("Guild");
  });

  test("is a generic word before its rules load, and for a type with no word", () => {
    expect(positionWordsOf("guild-ranks", undefined)).toEqual({ many: "Entities", one: "Entity" });
    expect(positionWordsOf("widgets", WORDS)).toEqual({ many: "Entities", one: "Entity" });
  });
});

describe("A word's article", () => {
  test("follows the word's first letter, whatever its case", () => {
    expect([withArticle("circle"), withArticle("guild rank"), withArticle("age"), withArticle("Order")]).toEqual([
      "a circle",
      "a guild rank",
      "an age",
      "an Order",
    ]);
  });
});
