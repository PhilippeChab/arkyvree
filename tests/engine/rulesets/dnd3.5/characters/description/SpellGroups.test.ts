import { describe, expect, test } from "bun:test";

import SpellGroups from "@/engine/rulesets/dnd3.5/characters/description/SpellGroups.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { buildAs } from "@/tests/support/dnd3.5/characters.ts";
import { findSeededCharacter } from "@/tests/support/seed.ts";

/** A seeded character's spell lists as its sheets list them: each list's levels, with their uses and spells. */
async function seededLists(name: string) {
  const character = await buildAs(DetailedCharacter, await findSeededCharacter(name));
  return Object.fromEntries(
    SpellGroups.describe(character).map((list) => [
      list.aptitudeName,
      list.levels.map((group) => ({ level: group.level, uses: group.uses, spells: group.spells.map((s) => s.name) })),
    ]),
  );
}

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
      getFeatListSpells: () => new Map(),
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

  test("lists a specialist's school slots, cantrips too, with the spells of the school in her spellbook", async () => {
    // Elara, a seeded evoker 3: a slot of her school at the 0th, first and second spell levels
    const lists = await seededLists("Elara Starweaver");
    expect(lists["Evocation Specialist Spells"]).toEqual([
      { level: 0, uses: 1, spells: ["Light"] },
      { level: 1, uses: 1, spells: ["Burning Hands", "Magic Missile"] },
      { level: 2, uses: 1, spells: ["Scorching Ray"] },
    ]);
    expect(lists["Wizard Spells"].map(({ level, uses }) => [level, uses])).toEqual([
      [0, 4],
      [1, 3],
      [2, 2],
    ]);
  });

  test("lists a cleric's one domain slot a spell level, with his domains' spells, each by its domain", async () => {
    // Theron, a seeded cleric 3 of the Healing and Sun domains: one domain slot at the first and second levels
    const theron = await buildAs(DetailedCharacter, await findSeededCharacter("Theron Lightbringer"));
    const lists = SpellGroups.describe(theron);
    const slot = lists.find((list) => list.aptitudeName === "Domain Spells")!;
    expect(
      slot.levels.map(({ level, uses, spells }) => ({
        level,
        uses,
        spells: spells.map(({ name, tags }) => `${name}: ${tags?.map((tag) => tag.name).join()}`),
      })),
    ).toEqual([
      { level: 1, uses: 1, spells: ["Cure Light Wounds: Healing Domain", "Endure Elements: Sun Domain"] },
      { level: 2, uses: 1, spells: ["Cure Moderate Wounds: Healing Domain", "Heat Metal: Sun Domain"] },
    ]);
    // His domains' own lists give no slot: their spells are on the cleric's list
    expect(lists.map((list) => list.aptitudeName)).not.toContain("Healing Domain Spells");
  });

  test("counts no slot on a list a feat brings where it gives none", () => {
    // A fighter who picked the sun domain through a prestige class: its first-level spell on its own list, no slot
    const character = {
      components: {
        aptitudes: {
          getAptitudes: () => ({
            sundomainspells: { id: "sun", name: "Sun Domain Spells", 1: { uses: 0, allowed: -1 } },
          }),
        },
        classes: {
          getCharacterClasses: () => ({
            fighter: {
              levels: [
                {
                  klassLevel: { level: 1 },
                  powers: [{ id: "endure", name: "Endure Elements", aptitudeId: "sun", powerLevel: 1 }],
                },
              ],
            },
          }),
        },
        powers: { getFlatPowers: () => ({}) },
      },
      getFeatListSpells: () => new Map([["sun", new Map([[1, new Set(["endure"])]])]]),
      getSpellTagLists: () => ({}),
      getSpellTags: () => ({}),
      getVirtualPowers: () => [],
    };
    expect(SpellGroups.describe(character)).toMatchObject([
      { aptitudeName: "Sun Domain Spells", levels: [{ level: 1, uses: null, spells: [{ name: "Endure Elements" }] }] },
    ]);
  });
});
