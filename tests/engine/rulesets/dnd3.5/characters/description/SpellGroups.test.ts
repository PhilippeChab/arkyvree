import { describe, expect, test } from "bun:test";

import SpellGroups from "@/engine/rulesets/dnd3.5/characters/description/SpellGroups.ts";

describe("SpellGroups", () => {
  test("shows a spell's tags on the lists they name, with whether their list joins its class's", () => {
    // Burning Hands, a cleric's through the fire domain and a specialist wizard's evocation spell
    const burningHands = (aptitudeId: string) => ({ id: "burning", name: "Burning Hands", aptitudeId, powerLevel: 1 });
    const character = {
      components: {
        aptitudes: {
          getAptitudes: () => ({
            clericspells: { id: "cleric", name: "Cleric Spells" },
            wizardspells: { id: "wizard", name: "Wizard Spells" },
          }),
        },
        classes: {
          getCharacterClasses: () => ({
            cleric: { levels: [{ klassLevel: { level: 1 }, powers: [burningHands("cleric")] }] },
            wizard: { levels: [{ klassLevel: { level: 1 }, powers: [burningHands("wizard")] }] },
          }),
        },
        powers: { getFlatPowers: () => ({}) },
      },
      getSpellTagLists: () => ({
        "Fire Domain": { aptitudeIds: ["fire", "cleric"], joinsClassList: true },
        "Evocation Specialist": { aptitudeIds: ["evocation", "wizard"], joinsClassList: false },
      }),
      getSpellTags: () => ({ burning: ["Fire Domain", "Evocation Specialist"] }),
      getVirtualPowers: () => [],
    };
    const tagsOn = (list: string) =>
      SpellGroups.describe(character).find((aptitude) => aptitude.aptitudeName === list)?.levels[0].spells[0].tags;
    expect(tagsOn("Cleric Spells")).toEqual([{ name: "Fire Domain", joinsClassList: true }]);
    expect(tagsOn("Wizard Spells")).toEqual([{ name: "Evocation Specialist", joinsClassList: false }]);
  });
});
