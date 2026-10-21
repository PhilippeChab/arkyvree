import { describe, expect, test } from "bun:test";

import { expectOk, guestApi } from "@/tests/support/api.ts";

describe("rules", () => {
  test("answers what every base rules' rulesets share, to anyone: words, kinds, levels and license", async () => {
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
  });
});
