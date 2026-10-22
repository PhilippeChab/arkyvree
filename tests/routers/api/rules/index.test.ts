import { describe, expect, test } from "bun:test";

import { CUSTOMIZATION_PAGE_TYPES } from "@/shared/customization/entities.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { expectOk, guestApi } from "@/tests/support/api.ts";

describe("rules", () => {
  test("answers what every base rules' rulesets share, to anyone: words, kinds, levels, lists, progression, level wizard and license", async () => {
    const rules = await expectOk(guestApi.api.rules.$get());
    const dnd35 = rules["Dungeons & Dragons: 3.5"];
    // Its word for every type, the engine's own (modifiers) with its own
    expect(dnd35.words.powers).toEqual({ many: "Spells", one: "Spell" });
    expect(dnd35.words.klasses).toEqual({ many: "Classes", one: "Class" });
    expect(dnd35.words.modifiers).toEqual({ many: "Modifiers", one: "Modifier" });
    // Its kinds, in its page's order: each its picture, and its tab's help where it has one
    expect(dnd35.kinds.map(({ type }) => type)).toEqual([
      "races",
      "languages",
      "skills",
      "feats",
      "powers",
      "items",
      "aptitudes",
      "klasses",
      "saves",
      "abilities",
      "mechanics",
    ]);
    expect(dnd35.kinds.filter((kind) => kind.help).map(({ type }) => type)).toEqual(["aptitudes", "mechanics"]);
    // Every kind has its word, and its list but the feats', whose section groups them by their families
    for (const { type } of dnd35.kinds) expect(dnd35.words[type]).toBeDefined();
    expect(dnd35.kinds.filter(({ type }) => !dnd35.lists[type]).map(({ type }) => type)).toEqual(["feats"]);
    // And what its row opens
    expect(Object.fromEntries(dnd35.kinds.map(({ opens, type }) => [type, opens]))).toEqual({
      races: "customization",
      languages: "page",
      skills: "page",
      feats: "customization",
      powers: "customization",
      items: "customization",
      aptitudes: "page",
      klasses: "progression",
      saves: "page",
      abilities: "page",
      mechanics: "page",
    });
    // A kind that opens a customization page is one such a page shows
    const customized = dnd35.kinds.filter(({ opens }) => opens === "customization").map(({ type }) => type);
    expect(customized.filter((type) => !isOneOf(type, CUSTOMIZATION_PAGE_TYPES))).toEqual([]);
    // Races and classes narrow by what they're for, abilities take no form, an empty list of saves its own words
    expect(dnd35.kinds.filter((kind) => kind.partitioned).map(({ type }) => type)).toEqual(["races", "klasses"]);
    expect(dnd35.kinds.filter((kind) => kind.readOnly).map(({ type }) => type)).toEqual(["abilities"]);
    // A class's new one's form says what each field is for, a mechanic's gives its description room
    expect(dnd35.kinds.filter((kind) => kind.fieldHelp).map(({ type }) => type)).toEqual(["klasses"]);
    expect(dnd35.kinds.filter((kind) => kind.longDescription).map(({ type }) => type)).toEqual(["mechanics"]);
    expect(dnd35.kinds.find((kind) => kind.type === "saves")?.empty).toBe(
      "No saving throws available for this ruleset.",
    );
    expect(dnd35.entityKinds).toEqual([
      { label: "Player Character", value: "pc" },
      { label: "Familiar", value: "familiar" },
      { label: "Animal Companion", value: "animalcompanion" },
      { label: "Special Mount", value: "mount" },
    ]);
    expect(dnd35.lastClassLevel).toBe(20);
    expect(dnd35.abilityScores).toEqual({ max: 100, min: 1 });
    expect(dnd35.powerLevels.at(0)).toEqual({ label: "Cantrips", level: 0 });
    expect(dnd35.powerLevels.at(-1)).toEqual({ label: "Level 9", level: 9 });
    expect(dnd35.license).toMatchObject({ text: "ogl" });
    // Its lists: a class's hit die as dice notation, an item's cost and weight in their units
    expect(dnd35.lists.klasses?.columns).toEqual([
      expect.objectContaining({ key: "hd", labels: expect.objectContaining({ 10: "d10" }) }),
    ]);
    expect(dnd35.lists.items?.columns.map(({ key, unit }) => [key, unit])).toEqual([
      ["type", undefined],
      ["template", undefined],
      ["costGp", "gp"],
      ["weight", "lbs"],
    ]);
    expect(dnd35.maxItemVariants).toBe(50);
    // Its classes' progression: a level's base attack bonus and skill points, a base per save, two spell tables
    expect(dnd35.progression.tracks.map(({ key, source }) => [key, source])).toEqual([
      ["bab", "field"],
      ["saves", "saves"],
      ["skills", "field"],
    ]);
    expect(dnd35.progression.tracks[0].labels?.[6]).toBe("+6/+1");
    expect(dnd35.progression.tables.map(({ all, key }) => [key, all])).toEqual([
      ["perDay", undefined],
      ["known", "All"],
    ]);
    // Its level wizard's words: an ability increase of 1, skill points buying ranks, class skills cheaper
    expect(dnd35.levelUp.abilityIncrease).toMatchObject({ amount: 1, word: { one: "Ability Increase" } });
    expect(dnd35.levelUp.pointSpend).toMatchObject({ favored: "Class Skill", unit: { many: "Ranks", one: "Rank" } });
  });
});
