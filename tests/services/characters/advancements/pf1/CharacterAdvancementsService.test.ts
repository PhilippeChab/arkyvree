import { describe, expect, test } from "bun:test";

import { CANTRIPS } from "@/content/pf1/generated/core-rulebook/spells/cantrips.ts";
import type { AdvancementPlanAnswer } from "@/engine/core/module/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterAdvancements, Characters, Rulesets } from "@/server/repositories/index.ts";
import { CharacterAdvancementsService } from "@/server/services/characters/advancements/index.ts";
import { getPlanAnswer, getStepOptions, stepAnswerOf } from "@/tests/support/advancementPlans.ts";
import { buildCharacter, createPf1Character } from "@/tests/support/pf1/characters.ts";
import { levelEditPlan, levelUpPlan, savedPicksOf } from "@/tests/support/pf1/levelPlans.ts";
import { addLevel, findPicks, type LevelPlan, picksOf } from "@/tests/support/pf1/levels.ts";
import { getPf1SeedCtx } from "@/tests/support/pf1/seed.ts";
import { makeSession } from "@/tests/support/users.ts";
import { PF1_BASE_RULES } from "@/vocabulary/pf1/baseRules.ts";
import { CHARACTER_XP } from "@/vocabulary/pf1/fields/index.ts";

/** The cantrips on the wizard's list: a wizard knows them all at 1st level. */
const WIZARD_CANTRIPS = CANTRIPS.filter(({ aptitudes }) => aptitudes.includes("Wizard Spells")).map(({ name }) => name);

/**
 * A human evoker's first level, Intelligence 16: 6 skill ranks (2 a wizard level, Intelligence's +3, a human's +1), his
 * arcane school and its two opposition schools, a familiar for his arcane bond (a cat), two General feats, the human's +2 to Constitution, every
 * cantrip and three 1st-level spells, two of them of his opposition schools: Charm Person (enchantment) and Ray of
 * Enfeeblement (necromancy).
 */
const EVOKER_1: LevelPlan = {
  hp: 6,
  skills: {
    "Knowledge (Arcana)": 1,
    "Knowledge (Planes)": 1,
    Spellcraft: 1,
    Linguistics: 1,
    Fly: 1,
    Perception: 1,
  },
  feats: {
    "Arcane School": ["Evocation Specialist"],
    "Opposition School": ["Opposition School: Enchantment", "Opposition School: Necromancy"],
    "Arcane Bond": ["Arcane Bond: Familiar"],
    "Familiar Bond": ["Cat Familiar"],
    General: ["Combat Casting", "Toughness"],
    "Racial Ability Score": ["Racial Ability Score: Constitution"],
  },
  spells: { "Wizard Spells": [...WIZARD_CANTRIPS, "Magic Missile", "Charm Person", "Ray of Enfeeblement"] },
};

/**
 * A human fighter's levels: 3 skill ranks each (2 a fighter level, Intelligence's +0, a human's +1), a General feat at
 * the 1st and 3rd levels (and a human's at the 1st), a fighter bonus feat at the 1st, 2nd and 4th, the human's +2 to
 * Strength at the 1st, and a Strength increase at the 4th.
 */
const FIGHTER_LEVELS: LevelPlan[] = [
  {
    hp: 10,
    skills: { Climb: 1, Swim: 1, Perception: 1 },
    feats: {
      General: ["Power Attack", "Toughness"],
      "Fighter Bonus Feat": ["Dodge"],
      "Racial Ability Score": ["Racial Ability Score: Strength"],
    },
  },
  { hp: 8, skills: { Climb: 1, Swim: 1, Intimidate: 1 }, feats: { "Fighter Bonus Feat": ["Improved Initiative"] } },
  { hp: 7, skills: { Climb: 1, Swim: 1, Intimidate: 1 }, feats: { General: ["Iron Will"] } },
  {
    hp: 6,
    abilities: ["Strength"],
    skills: { Climb: 1, Swim: 1, Intimidate: 1 },
    feats: { "Fighter Bonus Feat": ["Cleave"] },
  },
];

/** A human fighter's scores, bought with the Core Rulebook's 15 points. */
const FIGHTER_SCORES = { Strength: 15, Dexterity: 14, Constitution: 13, Intelligence: 10, Wisdom: 12, Charisma: 8 };

/**
 * `EVOKER_1` with the human's +2 to Intelligence (16 + 2 = 18): 7 skill ranks (2 a wizard level, Intelligence 18's +4,
 * a human's +1), Knowledge (History) the 7th.
 */
const RACIAL_INTELLIGENCE_EVOKER_1: LevelPlan = {
  ...EVOKER_1,
  skills: { ...EVOKER_1.skills, "Knowledge (History)": 1 },
  feats: { ...EVOKER_1.feats, "Racial Ability Score": ["Racial Ability Score: Intelligence"] },
};

const session = makeSession();

/** A pool's room in a pick step's answer, by the pool's name. */
function poolOf(answer: AdvancementPlanAnswer, step: "feats" | "spells", name: string) {
  return Object.values(stepAnswerOf(answer, step, "pick").pools).find((pool) => pool.name === name);
}

/** A skills step's budget and each level's points in a plan's answer. */
function skillPointsOf(answer: AdvancementPlanAnswer) {
  const { budget, perAdvancement } = stepAnswerOf(answer, "skills", "spend");
  return { budget, perAdvancement };
}

/** A new human fighter of `FIGHTER_SCORES`, with experience enough for any level. */
async function createFighter() {
  return await createPf1Character(session, { abilities: FIGHTER_SCORES, fields: { [CHARACTER_XP]: 300_000 } });
}

/** A human fighter with fighter levels 1 to `count` of `FIGHTER_LEVELS`: the character and its levels. */
async function createFighterAt(count: number) {
  const character = await createFighter();
  const levels = [];
  for (const [index, plan] of FIGHTER_LEVELS.slice(0, count).entries())
    levels.push(await addLevel(session, character.id, "Fighter", index + 1, plan));
  return { character, levels };
}

/** A new human of Intelligence 16, with experience enough for any level. */
async function createScholar() {
  return await createPf1Character(session, { abilities: { Intelligence: 16 }, fields: { [CHARACTER_XP]: 300_000 } });
}

/** The answer to a plan of one fighter level for `characterId`, its next, with `plan`'s picks. */
async function fighterLevelAnswer(characterId: string, level: number, plan: Omit<LevelPlan, "hp"> = {}) {
  const ctx = await getPf1SeedCtx();
  const abilityIncreases = (plan.abilities ?? []).map((name) => ({ amount: 1, entityId: ctx.abilityMap[name] }));
  return await getPlanAnswer(
    session,
    characterId,
    levelUpPlan([{ classId: ctx.classMap.pc["Fighter"], level, hp: 10, abilityIncreases }], picksOf(ctx, plan)),
  );
}

/** What a call answers: its result, or its refusal's message. */
async function outcomeOf(call: () => Promise<unknown>) {
  return await call().then(
    () => "saved",
    (error: Error) => error.message,
  );
}

/** The ids of a level's picks of a step, sorted. */
async function pickedIds(step: string, advancementId: string) {
  return (await findPicks(step, [advancementId])).map(({ entityId }) => entityId).sort();
}

/** A plan of wizard levels 1 to `count`, with `picks` pooled over them. */
async function wizardLevelsPlan(count: number, picks: Omit<LevelPlan, "hp">) {
  const ctx = await getPf1SeedCtx();
  const levels = Array.from({ length: count }, (_, i) => ({ classId: ctx.classMap.pc["Wizard"], level: i + 1, hp: 6 }));
  return levelUpPlan(levels, picksOf(ctx, picks));
}

describe("A Pathfinder character's levels", () => {
  describe("creating a character", () => {
    test("makes one on the seeded Pathfinder core rules, of its race, with its scores", async () => {
      const ctx = await getPf1SeedCtx();
      const character = await createPf1Character(session, { race: "Elf", abilities: { Intelligence: 15 } });
      const ruleset = await Rulesets.findOne(db, { id: character.rulesetId });
      expect(ruleset).toMatchObject({ name: "Core PSD 1", baseRules: PF1_BASE_RULES });
      expect(await CharacterAdvancements.findMany(db, { characterId: character.id })).toEqual([]);
      const built = await buildCharacter(character.id);
      expect(built.components.identity.getIdentity().physiology.race.id).toBe(ctx.raceMap.pc["Elf"]);
      // An elf's +2 Dexterity, +2 Intelligence, −2 Constitution over the scores given
      const { dexterity, intelligence, constitution } = built.components.abilities.getAbilities();
      expect([dexterity.total, intelligence.total, constitution.total]).toEqual([12, 17, 8]);
    });
  });

  describe("planning a human fighter's first level", () => {
    test("opens two General feats, a fighter bonus feat and the human's racial ability pick", async () => {
      const character = await createFighter();
      const answer = await fighterLevelAnswer(character.id, 1);
      expect(
        ["General", "Fighter Bonus Feat", "Racial Ability Score", "Arcane School"].map(
          (name) => poolOf(answer, "feats", name)?.allowed,
        ),
      ).toEqual([2, 1, 1, 0]);
    });

    test("gives 3 skill ranks, a rank a point whatever the skill, none past the 1st level's 1", async () => {
      const character = await createFighter();
      const skills = stepAnswerOf(await fighterLevelAnswer(character.id, 1), "skills", "spend");
      expect(skills).toMatchObject({ budget: 3, perAdvancement: [3] });
      const row = (name: string) => skills.rows.find((r) => r.name === name)!;
      // Climb is a fighter's class skill, Perception isn't: a point buys a rank of either
      expect(
        [row("Climb"), row("Perception")].map(({ favored, maxPoints, step, valuesByPoints }) => ({
          favored,
          maxPoints,
          step,
          valuesByPoints,
        })),
      ).toEqual([
        { favored: true, maxPoints: 1, step: 1, valuesByPoints: [0, 1] },
        { favored: false, maxPoints: 1, step: 1, valuesByPoints: [0, 1] },
      ]);
      expect(skills.rows.map(({ name }) => name)).not.toContain("Spot");
    });

    test("rolls a d10 for its hit points", async () => {
      const character = await createFighter();
      const hp = stepAnswerOf(await fighterLevelAnswer(character.id, 1), "hp", "value");
      expect(hp.advancements).toMatchObject([{ max: 10, min: 1, roll: "d10" }]);
    });
  });

  describe("saving a first level", () => {
    test("saves its hit points, skill ranks, feats and the human's racial ability pick", async () => {
      const ctx = await getPf1SeedCtx();
      const character = await createFighter();
      const level = await addLevel(session, character.id, "Fighter", 1, FIGHTER_LEVELS[0]);
      expect(level).toMatchObject({ characterId: character.id, position: 1 });
      expect(await findPicks("hp", [level.id])).toMatchObject([{ amount: 10 }]);
      expect(await findPicks("abilities", [level.id])).toEqual([]);
      const { feats, skills } = picksOf(ctx, FIGHTER_LEVELS[0]);
      expect(await pickedIds("feats", level.id)).toEqual(Object.values(feats!).flat().sort());
      expect((await findPicks("skills", [level.id])).map(({ entityId, amount }) => [entityId, amount]).sort()).toEqual(
        Object.entries(skills!).sort(),
      );
      // The racial pick is the human's +2 Strength: 15 + 2
      expect((await buildCharacter(character.id)).components.abilities.getAbilities().strength.total).toBe(17);
    });

    test("refuses a first level that leaves the human's racial ability pick unmade", async () => {
      const character = await createFighter();
      const { "Racial Ability Score": _, ...feats } = FIGHTER_LEVELS[0].feats!;
      expect(
        await outcomeOf(() => addLevel(session, character.id, "Fighter", 1, { ...FIGHTER_LEVELS[0], feats })),
      ).toContain("Racial Ability Score: 1 unspent slot(s) (0/1)");
    });

    test("refuses a feat whose prerequisites the character lacks, unless forced", async () => {
      const character = await createFighter();
      // Cleave needs Power Attack, which the level doesn't pick
      const plan = { ...FIGHTER_LEVELS[0], feats: { ...FIGHTER_LEVELS[0].feats, General: ["Cleave", "Toughness"] } };
      expect(await outcomeOf(() => addLevel(session, character.id, "Fighter", 1, plan))).toMatch(/Cleave/);
      expect(await outcomeOf(() => addLevel(session, character.id, "Fighter", 1, plan, true))).toBe("saved");
    });
  });

  describe("leveling up", () => {
    test("opens a General feat at the odd levels alone, and a fighter bonus feat at the 1st, 2nd and 4th", async () => {
      const { character } = await createFighterAt(1);
      const pools = [];
      for (const level of [2, 3, 4]) {
        const answer = await fighterLevelAnswer(character.id, level);
        pools.push([
          level,
          poolOf(answer, "feats", "General")!.available,
          poolOf(answer, "feats", "Fighter Bonus Feat")!.available,
        ]);
        await addLevel(session, character.id, "Fighter", level, FIGHTER_LEVELS[level - 1]);
      }
      expect(pools).toEqual([
        [2, 0, 1],
        [3, 1, 0],
        [4, 0, 1],
      ]);
    });

    test("saves several levels at once, their picks pooled and spread over them", async () => {
      const ctx = await getPf1SeedCtx();
      const character = await createFighter();
      const fighter = ctx.classMap.pc["Fighter"];
      // Fighter 1 and 2: 3 + 3 ranks, 2 General feats, 2 fighter bonus feats and the racial pick
      const [first, second] = FIGHTER_LEVELS;
      const picks = picksOf(ctx, {
        skills: { Climb: 2, Swim: 2, Perception: 1, Intimidate: 1 },
        feats: {
          General: first.feats!.General,
          "Fighter Bonus Feat": [...first.feats!["Fighter Bonus Feat"], ...second.feats!["Fighter Bonus Feat"]],
          "Racial Ability Score": first.feats!["Racial Ability Score"],
        },
      });
      const saved = await CharacterAdvancementsService.addAdvancements(
        session,
        character.id,
        levelUpPlan(
          [
            { classId: fighter, level: 1, hp: 10 },
            { classId: fighter, level: 2, hp: 8 },
          ],
          picks,
        ),
      );
      expect(saved.map(({ position }) => position)).toEqual([1, 2]);
      const built = await buildCharacter(character.id);
      const { climb, perception } = built.components.skills.getSkills();
      expect([climb.rank, perception.rank]).toEqual([2, 1]);
      expect(built.components.combat.getCombat().bab).toBe(2);
    });

    test("raises a skill's rank cap with the character's level", async () => {
      const { character } = await createFighterAt(1);
      const skills = stepAnswerOf(await fighterLevelAnswer(character.id, 2), "skills", "spend");
      // A skill holds 2 ranks at the 2nd level: Climb, which holds 1, one more point; Acrobatics, which holds none, two
      expect(skills.rows.find(({ name }) => name === "Climb")).toMatchObject({ current: 1, maxPoints: 1 });
      expect(skills.rows.find(({ name }) => name === "Acrobatics")).toMatchObject({ current: 0, maxPoints: 2 });
    });

    test("takes an ability increase at the 4th level alone: refused at the 3rd, required at the 4th", async () => {
      const { character } = await createFighterAt(2);
      expect(
        await outcomeOf(() =>
          addLevel(session, character.id, "Fighter", 3, { ...FIGHTER_LEVELS[2], abilities: ["Strength"] }),
        ),
      ).toEndWith("Ability increase is not available at this level");
      await addLevel(session, character.id, "Fighter", 3, FIGHTER_LEVELS[2]);
      expect(
        await outcomeOf(() => addLevel(session, character.id, "Fighter", 4, { ...FIGHTER_LEVELS[3], abilities: [] })),
      ).toEndWith("Ability increase is required at this level");
      const fourth = await addLevel(session, character.id, "Fighter", 4, FIGHTER_LEVELS[3]);
      const ctx = await getPf1SeedCtx();
      expect(await findPicks("abilities", [fourth.id])).toMatchObject([
        { entityId: ctx.abilityMap["Strength"], amount: 1 },
      ]);
      // 15 + 2 + 1
      expect((await buildCharacter(character.id)).components.abilities.getAbilities().strength.total).toBe(18);
    });
  });

  describe("editing a saved level", () => {
    test("reads its picks back, and saves new ones in their place", async () => {
      const ctx = await getPf1SeedCtx();
      const {
        character,
        levels: [, second],
      } = await createFighterAt(2);
      const saved = savedPicksOf(
        await CharacterAdvancementsService.getAdvancementPlan(session, character.id, second.id),
      );
      expect(saved).toMatchObject({ hp: 8, ...picksOf(ctx, FIGHTER_LEVELS[1]) });

      const changed = picksOf(ctx, {
        skills: { Climb: 1, Swim: 1, Ride: 1 },
        feats: { "Fighter Bonus Feat": ["Cleave"] },
      });
      await CharacterAdvancementsService.updateSavedAdvancement(
        session,
        character.id,
        second.id,
        levelEditPlan({ hp: 9 }, changed),
      );
      expect(await findPicks("hp", [second.id])).toMatchObject([{ amount: 9 }]);
      expect(await pickedIds("feats", second.id)).toEqual([ctx.featMap["Cleave"]]);
      expect(await pickedIds("skills", second.id)).toEqual(Object.keys(changed.skills!).sort());
    });
  });

  describe("removing a level", () => {
    test("removes the last one, with its picks", async () => {
      const {
        character,
        levels: [first, second],
      } = await createFighterAt(2);
      expect(await CharacterAdvancementsService.removeAdvancement(session, character.id)).toMatchObject({
        success: true,
      });
      expect((await CharacterAdvancements.findMany(db, { characterId: character.id })).map(({ id }) => id)).toEqual([
        first.id,
      ]);
      expect(await findPicks("feats", [second.id])).toEqual([]);
      expect(await findPicks("skills", [second.id])).toEqual([]);
    });
  });

  describe("a wizard", () => {
    test("picks an arcane school, which opens as many opposition schools as it names: two", async () => {
      const ctx = await getPf1SeedCtx();
      const character = await createPf1Character(session, { abilities: { Intelligence: 16 } });
      const wizardLevel = (feats: LevelPlan["feats"]) =>
        getPlanAnswer(
          session,
          character.id,
          levelUpPlan([{ classId: ctx.classMap.pc["Wizard"], level: 1, hp: 6 }], picksOf(ctx, { feats })),
        );
      expect(poolOf(await wizardLevel({}), "feats", "Opposition School")?.allowed).toBe(0);
      const specialist = await wizardLevel({ "Arcane School": ["Evocation Specialist"] });
      expect(poolOf(specialist, "feats", "Opposition School")?.allowed).toBe(2);
      // A universalist names none
      expect(ctx.featMap["Universalist"]).toBeDefined();
      expect(
        poolOf(await wizardLevel({ "Arcane School": ["Universalist"] }), "feats", "Opposition School")?.allowed,
      ).toBe(0);
    });

    test("is offered an opposition school's spells, and learns them", async () => {
      const ctx = await getPf1SeedCtx();
      const character = await createPf1Character(session, { abilities: { Intelligence: 16 } });
      const plan = levelUpPlan(
        [{ classId: ctx.classMap.pc["Wizard"], level: 1, hp: 6 }],
        picksOf(ctx, { feats: EVOKER_1.feats }),
      );
      const offered = async (search: string) =>
        (
          await getStepOptions(
            session,
            character.id,
            "spells",
            plan,
            { advancement: 0, pool: ctx.aptMap["Wizard Spells"] },
            { search },
          )
        ).items.map(({ name }) => name);
      expect(await offered("Charm Person")).toContain("Charm Person");
      expect(await offered("Ray of Enfeeblement")).toContain("Ray of Enfeeblement");

      const level = await addLevel(session, character.id, "Wizard", 1, EVOKER_1);
      expect(await pickedIds("spells", level.id)).toEqual(
        expect.arrayContaining([ctx.spellMap["Charm Person"], ctx.spellMap["Ray of Enfeeblement"]]),
      );
      expect(await pickedIds("feats", level.id)).toEqual(
        expect.arrayContaining(
          ["Evocation Specialist", "Opposition School: Enchantment", "Opposition School: Necromancy"].map(
            (name) => ctx.featMap[name],
          ),
        ),
      );
      // The cat familiar is bonded to him
      expect(await Characters.findOne(db, { parentCharacterId: character.id, kind: "familiar" })).toBeDefined();
    });

    test("refuses a third opposition school, forced or not", async () => {
      const character = await createPf1Character(session, { abilities: { Intelligence: 16 } });
      const plan = {
        ...EVOKER_1,
        feats: {
          ...EVOKER_1.feats,
          "Opposition School": [
            "Opposition School: Enchantment",
            "Opposition School: Necromancy",
            "Opposition School: Illusion",
          ],
        },
      };
      for (const force of [false, true]) {
        expect(await outcomeOf(() => addLevel(session, character.id, "Wizard", 1, plan, force))).toMatch(
          /Opposition School/,
        );
      }
    });
  });

  describe("a human's racial ability pick on Intelligence", () => {
    test("counts in the skill ranks of the level that picks it: a wizard 1 of Intelligence 16 plans 7", async () => {
      const character = await createScholar();
      const answer = await getPlanAnswer(
        session,
        character.id,
        await wizardLevelsPlan(1, RACIAL_INTELLIGENCE_EVOKER_1),
      );
      expect(skillPointsOf(answer)).toEqual({ budget: 7, perAdvancement: [7] });
    });

    test("leaves a wizard 1 of Intelligence 16 at 6 ranks when the pick is Strength", async () => {
      const character = await createScholar();
      const plan = {
        ...EVOKER_1,
        feats: { ...EVOKER_1.feats, "Racial Ability Score": ["Racial Ability Score: Strength"] },
      };
      const answer = await getPlanAnswer(session, character.id, await wizardLevelsPlan(1, plan));
      expect(skillPointsOf(answer)).toEqual({ budget: 6, perAdvancement: [6] });
    });

    test("saves the 7 ranks unforced, as the sheet counts them, and refuses an 8th", async () => {
      const character = await createScholar();
      const { skills } = RACIAL_INTELLIGENCE_EVOKER_1;
      const eight = { ...RACIAL_INTELLIGENCE_EVOKER_1, skills: { ...skills, Appraise: 1 } };
      expect(await outcomeOf(() => addLevel(session, character.id, "Wizard", 1, eight))).toContain(
        "Appraise: 1 skill point(s) past what the levels take",
      );
      const level = await addLevel(session, character.id, "Wizard", 1, RACIAL_INTELLIGENCE_EVOKER_1);
      expect(await findPicks("skills", [level.id])).toHaveLength(7);
      const built = await buildCharacter(character.id);
      expect(built.components.abilities.getAbilities().intelligence.total).toBe(18);
      expect(built.components.skills.getSkillBudget()).toMatchObject({ total: 7, spent: 7, available: 0 });
    });

    test("counts in every level of a plan that picks it, which saves their ranks unforced: 7 and 7", async () => {
      const character = await createScholar();
      // Wizard 2 learns two more 1st-level spells, and its 7 ranks raise each of the 1st level's skills to 2
      const plan = {
        feats: RACIAL_INTELLIGENCE_EVOKER_1.feats,
        spells: { "Wizard Spells": [...RACIAL_INTELLIGENCE_EVOKER_1.spells!["Wizard Spells"], "Shield", "Mage Armor"] },
        skills: Object.fromEntries(Object.keys(RACIAL_INTELLIGENCE_EVOKER_1.skills!).map((name) => [name, 2])),
      };
      const request = await wizardLevelsPlan(2, plan);
      expect(skillPointsOf(await getPlanAnswer(session, character.id, request))).toEqual({
        budget: 14,
        perAdvancement: [7, 7],
      });
      expect(await outcomeOf(() => CharacterAdvancementsService.addAdvancements(session, character.id, request))).toBe(
        "saved",
      );
      expect((await buildCharacter(character.id)).components.skills.getSkillBudget()).toMatchObject({
        total: 14,
        spent: 14,
      });
    });

    test("keeps the 7 ranks in the level's edit: its skills step, and its save", async () => {
      const character = await createScholar();
      const level = await addLevel(session, character.id, "Wizard", 1, RACIAL_INTELLIGENCE_EVOKER_1);
      const saved = await CharacterAdvancementsService.getAdvancementPlan(session, character.id, level.id);
      expect(skillPointsOf(await getPlanAnswer(session, character.id, saved))).toEqual({
        budget: 7,
        perAdvancement: [7],
      });
      expect(
        await outcomeOf(() =>
          CharacterAdvancementsService.updateSavedAdvancement(session, character.id, level.id, saved),
        ),
      ).toBe("saved");
    });
  });
});
