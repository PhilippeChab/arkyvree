import { describe, expect, test } from "bun:test";

import { expectOk, guestApi } from "@/tests/support/api.ts";

describe("rules", () => {
  test("answers what every base rules' rulesets share, to anyone: words, kinds, levels, lists, progression and license", async () => {
    const rules = await expectOk(guestApi.api.rules.$get());
    const dnd35 = rules["Dungeons & Dragons: 3.5"];
    expect(dnd35.words).toEqual({ powers: { many: "Spells", one: "Spell" } });
    expect(dnd35.entityKinds).toEqual([
      { label: "Player Character", value: "pc" },
      { label: "Familiar", value: "familiar" },
      { label: "Animal Companion", value: "animalcompanion" },
      { label: "Special Mount", value: "mount" },
    ]);
    expect(dnd35.lastClassLevel).toBe(20);
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
  });
});
