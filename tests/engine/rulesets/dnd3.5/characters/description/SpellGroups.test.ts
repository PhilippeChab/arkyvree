import { describe, expect, test } from "bun:test";

import SpellGroups from "@/engine/rulesets/dnd3.5/characters/description/SpellGroups.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { addClassLevels, addFeats } from "@/scripts/db/seeds/seedCharacter.ts";
import { db } from "@/server/database/index.ts";
import { Characters } from "@/server/repositories/index.ts";
import { buildAs } from "@/tests/support/dnd3.5/characters.ts";
import { createSeedCharacter } from "@/tests/support/dnd3.5/levelFixtures.ts";
import { findSeededCharacter, getSeedCtx } from "@/tests/support/seed.ts";

/**
 * A new cleric 5 / wizard 5, Wisdom 16 (+3) and Intelligence 16 (+3): of the Good and Magic domains, and an evoker. Built
 * as the engine builds it.
 */
async function buildClericWizard() {
  const ctx = await getSeedCtx();
  const characterId = await createSeedCharacter(ctx, "cleric", { xp: 45000, abilities: { Intelligence: 16 } });
  const clericLevels = await addClassLevels(db, ctx, characterId, "Cleric", [1, 2, 3, 4, 5], [8, 6, 6, 6, 6]);
  const wizardLevels = await addClassLevels(db, ctx, characterId, "Wizard", [1, 2, 3, 4, 5], [4, 3, 3, 3, 3]);
  await addFeats(db, ctx, clericLevels, [
    { levelIndex: 0, featName: "Good Domain", aptitude: "Cleric Domain" },
    { levelIndex: 0, featName: "Magic Domain", aptitude: "Cleric Domain" },
  ]);
  await addFeats(db, ctx, wizardLevels, [
    { levelIndex: 0, featName: "Evocation Specialist", aptitude: "Wizard Specialization" },
  ]);
  return buildAs(DetailedCharacter, (await Characters.findOne(db, { id: characterId }))!);
}

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

/** A seeded character's slots per day as its sheets' summary prints them. */
async function seededPerDay(name: string) {
  return SpellGroups.describePerDay(await buildAs(DetailedCharacter, await findSeededCharacter(name)));
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

  describe("describePerDay", () => {
    test("counts a cleric's domain slot as one more in his class's row, from the first spell level", async () => {
      // Theron, a seeded cleric 3 of the Healing and Sun domains: no Domain Spells row of its own
      expect(await seededPerDay("Theron Lightbringer")).toEqual({
        levels: [0, 1, 2],
        lists: [{ aptitudeName: "Cleric Spells", slots: ["4", "3+1", "2+1"] }],
      });
    });

    test("counts a specialist wizard's school slot as one more in her class's row, cantrips too", async () => {
      // Elara, a seeded evoker 3: no Evocation Specialist Spells row of its own
      expect(await seededPerDay("Elara Starweaver")).toEqual({
        levels: [0, 1, 2],
        lists: [{ aptitudeName: "Wizard Spells", slots: ["4+1", "3+1", "2+1"] }],
      });
    });

    test("prints a list no feat adds to as its slots alone", async () => {
      // Vex, a seeded sorcerer 3
      expect(await seededPerDay("Vex Flamecaller")).toEqual({
        levels: [0, 1],
        lists: [{ aptitudeName: "Sorcerer Spells", slots: ["6", "6"] }],
      });
    });

    test("gives a multiclass caster a row per class, each with the slot its own feat adds", async () => {
      // Cleric 5 (Wisdom 16): 5/3/2/1 and his bonus spells; wizard 5 (Intelligence 16): 4/3/2/1 and his
      expect(SpellGroups.describePerDay(await buildClericWizard())).toEqual({
        levels: [0, 1, 2, 3],
        lists: [
          { aptitudeName: "Cleric Spells", slots: ["5", "4+1", "3+1", "2+1"] },
          { aptitudeName: "Wizard Spells", slots: ["4+1", "4+1", "3+1", "2+1"] },
        ],
      });
    });

    test("gives a character without slots none", async () => {
      // Bjorn, a seeded fighter 5
      expect(await seededPerDay("Bjorn Ironhand")).toEqual({ levels: [], lists: [] });
    });

    test("keeps a row of its own for a slot a feat's list gives where its class's lists have none", () => {
      // A domain slot at the second spell level, where the cleric has no slot of his own
      const character = {
        components: {
          aptitudes: {
            getAptitudes: () => ({
              clericspells: { id: "cleric", name: "Cleric Spells", 1: { uses: 2, allowed: -1 } },
              domainspells: {
                id: "domain",
                name: "Domain Spells",
                1: { uses: 1, allowed: 0 },
                2: { uses: 1, allowed: 0 },
              },
            }),
          },
          classes: { getCharacterClasses: () => ({}) },
          powers: { getFlatPowers: () => ({}) },
        },
        getFeatListSpells: () => new Map([["domain", new Map()]]),
        getSpellTagLists: () => ({ Domains: { aptitudeIds: ["domain", "cleric"], joinsClassList: false } }),
        getSpellTags: () => ({}),
        getVirtualPowers: () => [],
      };
      expect(SpellGroups.describePerDay(character)).toEqual({
        levels: [1, 2],
        lists: [
          { aptitudeName: "Cleric Spells", slots: ["2+1", null] },
          { aptitudeName: "Domain Spells", slots: [null, "1"] },
        ],
      });
    });
  });
});
