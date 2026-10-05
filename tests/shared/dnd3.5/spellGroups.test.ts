import { describe, expect, test } from "bun:test";

import { buildSpellGroups } from "@/shared/dnd3.5/spellGroups.ts";

describe("buildSpellGroups", () => {
  test("shows a spell's tags on the lists they name, with whether their list joins its class's", () => {
    // Burning Hands, a cleric's through the fire domain and a specialist wizard's evocation spell
    const burningHands = (aptitudeId: string) => ({ id: "burning", name: "Burning Hands", aptitudeId, powerLevel: 1 });
    const sheet = {
      classes: {
        cleric: { levels: [{ klassLevel: { level: 1 }, powers: [burningHands("cleric")] }] },
        wizard: { levels: [{ klassLevel: { level: 1 }, powers: [burningHands("wizard")] }] },
      },
      aptitudes: {
        clericspells: { id: "cleric", name: "Cleric Spells" },
        wizardspells: { id: "wizard", name: "Wizard Spells" },
      },
      spellTags: { burning: ["Fire Domain", "Evocation Specialist"] },
      spellTagLists: {
        "Fire Domain": { aptitudeIds: ["fire", "cleric"], joinsClassList: true },
        "Evocation Specialist": { aptitudeIds: ["evocation", "wizard"], joinsClassList: false },
      },
    };
    const tagsOn = (list: string) =>
      buildSpellGroups(sheet).find((aptitude) => aptitude.aptitudeName === list)?.levels[0].spells[0].tags;
    expect(tagsOn("Cleric Spells")).toEqual([{ name: "Fire Domain", joinsClassList: true }]);
    expect(tagsOn("Wizard Spells")).toEqual([{ name: "Evocation Specialist", joinsClassList: false }]);
  });
});
