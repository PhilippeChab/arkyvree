import { describe, expect, test } from "bun:test";

import { buildCharacter, createPf1Character, type NewPf1Character } from "@/tests/support/pf1/characters.ts";
import { addLevel, type LevelPlan } from "@/tests/support/pf1/levels.ts";
import { makeSession } from "@/tests/support/users.ts";
import { CHARACTER_XP } from "@/vocabulary/pf1/fields/index.ts";

type Built = Awaited<ReturnType<typeof buildCharacter>>;

/**
 * A human fighter's first level: 3 skill ranks (2 a fighter level, Intelligence's +0, a human's +1), two General feats
 * (the 1st level's and a human's), a fighter bonus feat, and the human's +2 to Strength.
 */
const FIGHTER_1: LevelPlan = {
  hp: 10,
  skills: { Climb: 1, Swim: 1, Perception: 1 },
  feats: {
    General: ["Power Attack", "Toughness"],
    "Fighter Bonus Feat": ["Dodge"],
    "Racial Ability Score": ["Racial Ability Score: Strength"],
  },
};

/** A fighter level past the first, its picks left to a forced save: what the tests read of it is its class's. */
const FIGHTER_LEVEL: LevelPlan = { hp: 10 };

/**
 * A human fighter's scores bought with the Core Rulebook's 15 points: 15 (7), 14 (5), 13 (3), 10 (0), 12 (2), 8 (−2).
 */
const FIGHTER_SCORES = { Strength: 15, Dexterity: 14, Constitution: 13, Intelligence: 10, Wisdom: 12, Charisma: 8 };

/** A halfling rogue's first level: Stealth among its 9 ranks (8 a rogue level, Intelligence's +1). */
const ROGUE_1: LevelPlan = {
  hp: 8,
  skills: {
    Stealth: 1,
    Acrobatics: 1,
    Perception: 1,
    "Disable Device": 1,
    "Sleight of Hand": 1,
    Bluff: 1,
    Climb: 1,
    "Escape Artist": 1,
    "Use Magic Device": 1,
  },
  feats: { General: ["Dodge"] },
};

const session = makeSession();

/** Each save's total, by its slug. */
function savesOf(built: Built) {
  return Object.fromEntries(
    Object.entries(built.components.saves.getSaves()).map(([slug, save]) => [slug, save.total]),
  );
}

/** Each ability's total, by its slug. */
function scoresOf(built: Built) {
  return Object.fromEntries(
    Object.entries(built.components.abilities.getAbilities()).map(([slug, ability]) => [slug, ability.total]),
  );
}

/** A skill's parts and total, by its slug. */
function skillOf(built: Built, slug: string) {
  const { ability, rank, size, total } = built.components.skills.getSkills()[slug];
  return { ability, rank, size, total };
}

/** A human fighter with fighter levels 1 to `count`, the first `FIGHTER_1`, the others forced. */
async function createFighter(count: number) {
  const character = await createPf1Character(session, {
    abilities: FIGHTER_SCORES,
    fields: { [CHARACTER_XP]: 300_000 },
  });
  await addLevel(session, character.id, "Fighter", 1, FIGHTER_1);
  for (let level = 2; level <= count; level++) {
    const plan = { ...FIGHTER_LEVEL, abilities: level % 4 === 0 ? ["Strength"] : [] };
    await addLevel(session, character.id, "Fighter", level, plan, true);
  }
  return character;
}

/** A new character of `values`, with `levels` of a class each, saved in order (forced when `force`). */
async function createLeveled(
  values: NewPf1Character,
  levels: [klass: string, level: number, plan: LevelPlan][],
  force = false,
) {
  const character = await createPf1Character(session, values);
  for (const [klass, level, plan] of levels) await addLevel(session, character.id, klass, level, plan, force);
  return await buildCharacter(character.id);
}

describe("A Pathfinder character's sheet", () => {
  describe("abilities", () => {
    test("give a human's Racial Ability Score: Strength pick +2 Strength", async () => {
      const built = await buildCharacter((await createFighter(1)).id);
      // 15 bought, +2 picked
      expect(scoresOf(built)).toEqual({
        strength: 17,
        dexterity: 14,
        constitution: 13,
        intelligence: 10,
        wisdom: 12,
        charisma: 8,
      });
    });

    test("give a dwarf his race's fixed adjustments: +2 Constitution, +2 Wisdom, −2 Charisma", async () => {
      const character = await createPf1Character(session, { race: "Dwarf" });
      expect(scoresOf(await buildCharacter(character.id))).toEqual({
        strength: 10,
        dexterity: 10,
        constitution: 12,
        intelligence: 10,
        wisdom: 12,
        charisma: 8,
      });
    });
  });

  describe("skills", () => {
    test("are the Core Rulebook's: Acrobatics, Perception and Stealth, no Hide, Spot, Listen, Jump or Tumble", async () => {
      const built = await buildCharacter((await createPf1Character(session)).id);
      const slugs = Object.keys(built.components.skills.getSkills());
      expect(slugs).toHaveLength(35);
      expect(slugs).toEqual(expect.arrayContaining(["acrobatics", "perception", "stealth", "linguistics"]));
      for (const gone of ["hide", "spot", "listen", "jump", "tumble", "movesilently", "speaklanguage"])
        expect(slugs).not.toContain(gone);
    });

    test("give a class skill with a rank +3, a cross-class skill a rank a point and no +3", async () => {
      const built = await buildCharacter((await createFighter(1)).id);
      // Climb, a fighter's class skill: 1 rank + Strength 17's +3 + 3
      expect(skillOf(built, "climb")).toEqual({ ability: 3, rank: 1, size: 0, total: 7 });
      // Perception, no fighter's: its one point bought a whole rank, + Wisdom 12's +1, and no +3
      expect(skillOf(built, "perception")).toEqual({ ability: 1, rank: 1, size: 0, total: 2 });
      // Intimidate, a fighter's class skill with no rank: Charisma 8's −1 alone
      expect(skillOf(built, "intimidate")).toEqual({ ability: -1, rank: 0, size: 0, total: -1 });
      // A human fighter 1's ranks: 2 + Intelligence 10's +0 + a human's 1, all spent
      expect(built.components.skills.getSkillBudget()).toMatchObject({ total: 3, spent: 3, available: 0 });
    });

    test("hold no more ranks than the character's level, a class skill's or not", async () => {
      // A human fighter 1 of Intelligence 14: 2 + 2 + 1 ranks, of which 2 asked of each skill, forced
      const built = await createLeveled(
        { abilities: { Intelligence: 14 } },
        [["Fighter", 1, { hp: 10, skills: { Climb: 2, Perception: 2 } }]],
        true,
      );
      expect([skillOf(built, "climb").rank, skillOf(built, "perception").rank]).toEqual([1, 1]);
      expect(built.components.skills.getSkillBudget()).toMatchObject({ total: 5, spent: 2 });
    });

    test("count a human's racial pick on Intelligence in its skill ranks, a pick on Strength not", async () => {
      // A human wizard 1 of Intelligence 16: 2 + Intelligence's modifier + a human's 1, its other picks left to a forced
      // save
      const wizardOf = (ability: string) =>
        createLeveled(
          { abilities: { Intelligence: 16 } },
          [["Wizard", 1, { hp: 6, feats: { "Racial Ability Score": [`Racial Ability Score: ${ability}`] } }]],
          true,
        );
      const intelligent = await wizardOf("Intelligence");
      // Intelligence 18's +4
      expect(intelligent.components.abilities.getAbilities().intelligence.total).toBe(18);
      expect(intelligent.components.skills.getSkillBudget().total).toBe(7);
      // Intelligence 16's +3
      expect((await wizardOf("Strength")).components.skills.getSkillBudget().total).toBe(6);
    });

    test("give a small character's Stealth its size's +4", async () => {
      const built = await createLeveled({ race: "Halfling", abilities: { Dexterity: 16, Intelligence: 12 } }, [
        ["Rogue", 1, ROGUE_1],
      ]);
      // 1 rank + Dexterity 18's +4 + a class skill's 3 + Small's 4
      expect(skillOf(built, "stealth")).toEqual({ ability: 4, rank: 1, size: 4, total: 12 });
    });
  });

  describe("combat maneuvers", () => {
    test("are BAB + Strength + size, and 10 + BAB + Strength + Dexterity + size: a medium fighter's", async () => {
      const { cmb, cmd, bab } = (await buildCharacter((await createFighter(1)).id)).components.combat.getCombat();
      // BAB 1, Strength 17's +3, Dexterity 14's +2, Medium's 0
      expect(bab).toBe(1);
      expect({ bab: cmb.bab, ability: cmb.ability, size: cmb.size, total: cmb.total }).toEqual({
        bab: 1,
        ability: 3,
        size: 0,
        total: 4,
      });
      expect(cmd.total).toBe(16);
    });

    test("take a small character's −1 on both", async () => {
      const built = await createLeveled({ race: "Halfling", abilities: { Dexterity: 16, Intelligence: 12 } }, [
        ["Rogue", 1, ROGUE_1],
      ]);
      const { cmb, cmd } = built.components.combat.getCombat();
      // BAB 0, Strength 10 − 2 = 8's −1, Small's −1; 10 + 0 − 1 + Dexterity 18's +4 − 1
      expect([cmb.total, cmd.total]).toEqual([-2, 12]);
    });

    test("follow the base attack bonus and Strength as the fighter levels: 4th level, Strength 18", async () => {
      const { cmb, cmd } = (await buildCharacter((await createFighter(4)).id)).components.combat.getCombat();
      // BAB 4 + Strength 18's +4; 10 + 4 + 4 + Dexterity's 2
      expect([cmb.total, cmd.total]).toEqual([8, 20]);
    });
  });

  describe("saves", () => {
    test("give a base class's good save +2 at its 1st level, a poor one +0", async () => {
      const built = await buildCharacter((await createFighter(1)).id);
      // Fortitude good: 2 + Constitution 13's +1; Reflex poor: 0 + Dexterity's +2; Will poor: 0 + Wisdom's +1
      expect(savesOf(built)).toEqual({ fortitude: 3, reflex: 2, will: 1 });
    });

    test("add a halfling's +1 luck to every save", async () => {
      const built = await createLeveled({ race: "Halfling", abilities: { Dexterity: 16, Intelligence: 12 } }, [
        ["Rogue", 1, ROGUE_1],
      ]);
      // Rogue 1: Fortitude poor 0, Reflex good 2 + Dexterity 18's 4, Will poor 0; each +1
      expect(savesOf(built)).toEqual({ fortitude: 1, reflex: 7, will: 1 });
    });

    test("give a prestige class's good save +1 at its 1st level, its poor ones +0", async () => {
      const character = await createFighter(5);
      await addLevel(session, character.id, "Duelist", 1, { hp: 10 }, true);
      const built = await buildCharacter(character.id);
      // Fighter 5: Fortitude 2 + 5/2 = 4, Reflex 5/3 = 1, Will 1; Duelist 1: Reflex (good) +1, the others +0; then
      // Constitution's +1, Dexterity's +2, Wisdom's +1
      expect(savesOf(built)).toEqual({ fortitude: 5, reflex: 4, will: 2 });
    });
  });
});
