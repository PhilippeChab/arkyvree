import { describe, expect, test } from "bun:test";

import type { InferResponseType } from "hono/client";

import { addClassLevels, addSpells } from "@/database/seeders/dnd3.5/characters/seedCharacter.ts";
import { type SeedContext } from "@/database/seeders/dnd3.5/characters/seedContext.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { postCharacter, sheetOf } from "@/tests/support/dnd3.5/characters.ts";
import { FIGHTER_LEVELS, picks, type Picks } from "@/tests/support/dnd3.5/levelFixtures.ts";
import {
  levelEditPlan,
  levelUpPlan,
  type PlannedClassLevel,
  type PlanPicks,
  savedPicksOf,
} from "@/tests/support/dnd3.5/levelPlans.ts";
import { findClassLevel } from "@/tests/support/dnd3.5/levels.ts";
import { createSeededTestRulesetWithExtensions, sourcesOf } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

/** A plan's answer, as the API answers it. */
type PlanAnswer = InferResponseType<(typeof levels)["plan"]["$post"], 200>;

/** A plan, as the API takes it. */
type PlanRequest = Parameters<(typeof levels)["plan"]["$post"]>[0]["json"];

/** A step's answer, any mechanic's. */
type StepAnswer = PlanAnswer["steps"][string];

/** A page of a step's options, as the API answers it: of any kind, its rows groups or not. */
type StepOptions = InferResponseType<(typeof options)["$post"], 200>;

const levels = api.api.characters.levels[":characterId"];
const level = levels[":advancementId"];
const options = levels.options[":step"];

/** Saves one level of class `classId`, at `levelNumber` in it, with these picks, returning the raw response. */
function addLevel(
  characterId: string,
  classId: string,
  levelNumber: number,
  hp: number,
  levelPicks: PlanPicks,
  force = false,
) {
  return addLevels(characterId, [{ classId, level: levelNumber, hp }], levelPicks, force);
}

/** Saves the levels of a level-up's plan, with these picks, returning the raw response. */
function addLevels(characterId: string, planned: PlannedClassLevel[], levelPicks: PlanPicks, force = false) {
  return levels.$post({ param: { characterId }, json: { ...levelUpPlan(planned, levelPicks), force } });
}

/**
 * A human fighter (INT 12): 16 skill points, 2 General feats and a bonus feat at the first level; 4 points and a bonus
 * feat at the second.
 */
function fighter1(ctx: SeedContext) {
  return picks(ctx, FIGHTER_LEVELS[0]);
}

function fighter2(ctx: SeedContext) {
  return picks(ctx, FIGHTER_LEVELS[1]);
}

/** A page of options, its rows groups (`grouped`) or not: refused when they're the other's. */
function optionsOf<G extends boolean>(answer: StepOptions, grouped: G) {
  if (answer.grouped !== grouped) throw new Error(`The options are grouped: ${answer.grouped}, not ${grouped}`);
  return answer as Extract<StepOptions, { grouped: G }>;
}

/** The pool named `name` of a `pick` step's answer. */
function poolNamed(step: Extract<StepAnswer, { mechanic: "pick" }>, name: string) {
  return Object.values(step.pools).find((pool) => pool.name === name);
}

/** The answer of step `name`, of mechanic `mechanic`: refused when the plan answered it by another. */
function stepOf<M extends StepAnswer["mechanic"]>(answer: PlanAnswer, name: string, mechanic: M) {
  const step = answer.steps[name];
  if (step?.mechanic !== mechanic) throw new Error(`The ${name} step answered as ${step?.mechanic}, not ${mechanic}`);
  return step as Extract<StepAnswer, { mechanic: M }>;
}

/** Saves one level and returns it. */
async function addLevelOk(
  characterId: string,
  classId: string,
  levelNumber: number,
  hp: number,
  levelPicks: PlanPicks,
) {
  const [created] = await expectOk(addLevel(characterId, classId, levelNumber, hp, levelPicks));
  return created;
}

/** A new human character of the seeded user's (INT 12), on the seeded ruleset unless `rulesetId` says otherwise. */
async function createCharacter(rulesetId?: string) {
  const ctx = await getSeedCtx();
  const scores: Record<string, number> = {
    Strength: 16,
    Dexterity: 14,
    Constitution: 14,
    Intelligence: 12,
    Wisdom: 10,
    Charisma: 8,
  };
  const abilities = Object.fromEntries(Object.entries(scores).map(([name, score]) => [ctx.abilityMap[name], score]));
  const character = await postCharacter({ rulesetId, abilities, alignment: "Neutral Good" });
  return { characterId: character.id, ctx };
}

/** The plan's answer (`plan`), each step by its mechanic. */
async function planOk(characterId: string, plan: PlanRequest) {
  return await expectOk(levels.plan.$post({ param: { characterId }, json: plan }));
}

/** A saved level, its plan read back by kind, with the level it edits and the class level its plan takes. */
async function readLevel(characterId: string, advancementId: string) {
  const plan = await expectOk(level.plan.$get({ param: { characterId, advancementId } }));
  const {
    advancements: [advancement],
  } = await planOk(characterId, plan);
  return {
    ...savedPicksOf(plan),
    editedLevelId: plan.editedLevelId,
    classId: advancement.track.id,
    level: advancement.position,
  };
}

describe("character levels", () => {
  describe("level up", () => {
    test("lists the classes a character can take, with the level each one is at", async () => {
      const { characterId, ctx } = await createCharacter();
      const fighter = ctx.classMap.pc["Fighter"];
      const nextFighterLevel = async () =>
        optionsOf(
          await expectOk(
            options.$post({ param: { characterId, step: "class-plan" }, query: {}, json: { plan: { steps: {} } } }),
          ),
          false,
        ).items.find((k) => k.id === fighter);

      expect(await nextFighterLevel()).toMatchObject({ track: { next: 1 }, eligible: true });
      const created = await addLevelOk(characterId, fighter, 1, 8, fighter1(ctx));
      expect(created).toMatchObject({ characterId, position: 1, entryId: (await findClassLevel(fighter, 1))!.id });
      expect(await nextFighterLevel()).toMatchObject({ track: { next: 2 } });
      await addLevelOk(characterId, fighter, 2, 6, fighter2(ctx));
      expect(await nextFighterLevel()).toMatchObject({ track: { next: 3 } });
    });

    test("refuses a step the ruleset doesn't give a level, and a pool's picker over a plan of no level", async () => {
      const { characterId, ctx } = await createCharacter();
      const plan = { steps: { "class-plan": [{ track: ctx.classMap.pc["Fighter"], position: 1 }] } };
      await expectStatus(options.$post({ param: { characterId, step: "languages" }, query: {}, json: { plan } }), 404);
      // A pool's picker reads its level's class: a plan without one has none
      await expectStatus(
        options.$post({
          param: { characterId, step: "feats" },
          query: {},
          json: { plan: { steps: {} }, pool: ctx.aptMap["General"] },
        }),
        400,
      );
    });

    test("answers the room a class level gives each step", async () => {
      const { characterId, ctx } = await createCharacter();
      const plan = await planOk(characterId, {
        steps: { "class-plan": [{ track: ctx.classMap.pc["Fighter"], position: 1 }] },
      });
      expect(plan.advancements.map(({ position }) => position)).toEqual([1]);

      expect(stepOf(plan, "skills", "spend")).toMatchObject({ budget: 16, perAdvancement: [16] });

      const feats = stepOf(plan, "feats", "pick");
      const pools = Object.values(feats.pools);
      expect(pools.reduce((sum, { available }) => sum + available, 0)).toBe(3);
      expect(poolNamed(feats, "General")?.available).toBe(2);
      expect(poolNamed(feats, "Fighter Bonus Feat")?.available).toBe(1);

      const spells = stepOf(plan, "spells", "pick");
      expect(Object.values(spells.pools).reduce((sum, { available }) => sum + available, 0)).toBe(0);

      // Ability increases only come every 4 character levels.
      expect(stepOf(plan, "abilities", "choose")).toMatchObject({ advancements: [] });
    });

    test("counts a half-orc's skill points by its Intelligence and its race's -2: a fighter 1's 8 at INT 12", async () => {
      const ctx = await getSeedCtx();
      const abilities = Object.fromEntries(
        Object.entries(ctx.abilityMap).map(([name, id]) => [id, name === "Intelligence" ? 12 : 14]),
      );
      const character = await postCharacter({ links: { race: ctx.raceMap.pc["Half-Orc"] }, abilities });
      const fighter = ctx.classMap.pc["Fighter"];
      // INT 12, 10 (+0) with the half-orc's -2: (2 + 0) x 4
      const plan = await planOk(character.id, { steps: { "class-plan": [{ track: fighter, position: 1 }] } });
      expect(stepOf(plan, "skills", "spend")).toMatchObject({ budget: 8 });

      const levelPicks = picks(ctx, {
        skills: { Climb: 4, Jump: 4 },
        feats: { General: ["Power Attack"], "Fighter Bonus Feat": ["Improved Initiative"] },
      });
      await addLevelOk(character.id, fighter, 1, 10, levelPicks);
      expect((await sheetOf(character.id)).skillBudget).toMatchObject({ total: 8, spent: 8, available: 0 });
    });

    test("counts the plan's levels in the character's total, which caps a rank", async () => {
      const { characterId, ctx } = await createCharacter();
      const fighter = ctx.classMap.pc["Fighter"];
      const climb = async (count: number) => {
        const plan = await planOk(characterId, {
          steps: { "class-plan": Array.from({ length: count }, (_, i) => ({ track: fighter, position: i + 1 })) },
        });
        expect(plan.advancements).toHaveLength(count);
        return stepOf(plan, "skills", "spend").rows.find(({ id }) => id === ctx.skillMap["Climb"]);
      };
      // A class skill's rank caps at the total + 3: 4 at the first level, 6 at the third, a point each
      expect(await climb(1)).toMatchObject({ maxPoints: 4 });
      expect(await climb(3)).toMatchObject({ maxPoints: 6 });
    });

    test("reads the planned levels' ability increases", async () => {
      const { characterId, ctx } = await createCharacter();
      const fighter = ctx.classMap.pc["Fighter"];
      const [strength, dexterity] = [ctx.abilityMap["Strength"], ctx.abilityMap["Dexterity"]];
      // Twelve levels: those of the fourth and the eighth take one, the twelfth's left to choose
      const abilities: { amount: number; id: string }[][] = Array.from({ length: 12 }, () => []);
      abilities[3] = [{ id: strength, amount: 1 }];
      abilities[7] = [
        { id: strength, amount: 2 },
        { id: dexterity, amount: 1 },
      ];
      const plan = await planOk(characterId, {
        steps: {
          "class-plan": abilities.map((_, i) => ({ track: fighter, position: i + 1 })),
          abilities,
        },
      });
      // In the order a sheet lists them, each with its increases
      expect(stepOf(plan, "abilities", "choose")).toMatchObject({
        advancements: [3, 7, 11],
        chosen: false,
        options: [
          { name: "Strength", score: 19 },
          { name: "Dexterity", score: 15 },
          { name: "Constitution", score: 14 },
          { name: "Intelligence", score: 12 },
          { name: "Wisdom", score: 10 },
          { name: "Charisma", score: 8 },
        ],
      });
    });
  });

  describe("spell pickers", () => {
    test("keeps a spell another class picked, and drops one this class already picked", async () => {
      const { characterId, ctx } = await createCharacter();
      const detectMagic = async (wizardLevel: number) => {
        const answer = await expectOk(
          options.$post({
            param: { characterId, step: "spells" },
            query: { search: "Detect Magic" },
            json: {
              plan: { steps: { "class-plan": [{ track: ctx.classMap.pc["Wizard"], position: wizardLevel }] } },
              pool: ctx.aptMap["Wizard Spells"],
              tier: "0",
            },
          }),
        );
        return optionsOf(answer, false).items.map((p) => p.name);
      };

      const [clericLevel] = await addClassLevels(db, ctx, characterId, "Cleric", [1], [8]);
      await addSpells(
        db,
        ctx,
        [clericLevel],
        [{ levelIndex: 0, spellName: "Detect Magic", aptitude: "Cleric Spells" }],
      );
      expect(await detectMagic(1)).toContain("Detect Magic");

      const [wizardLevel] = await addClassLevels(db, ctx, characterId, "Wizard", [1], [4]);
      await addSpells(
        db,
        ctx,
        [wizardLevel],
        [{ levelIndex: 0, spellName: "Detect Magic", aptitude: "Wizard Spells" }],
      );
      expect(await detectMagic(2)).not.toContain("Detect Magic");
    });

    test("leaves out the spells the wizard picked already, as the feat picker leaves out a feat held", async () => {
      const { characterId, ctx } = await createCharacter();
      const wizardSpells = ctx.aptMap["Wizard Spells"];
      const classPlan = [{ track: ctx.classMap.pc["Wizard"], position: 1 }];
      const cantrips = async (spells: { id: string; pool: string; tier: string }[] = []) => {
        const answer = await expectOk(
          options.$post({
            param: { characterId, step: "spells" },
            query: { limit: "100" },
            json: { plan: { steps: { "class-plan": classPlan, spells } }, pool: wizardSpells, tier: "0" },
          }),
        );
        return optionsOf(answer, false).items;
      };

      const offered = await cantrips();
      const [picked, other] = offered;
      const left = await cantrips([{ id: picked.id, pool: wizardSpells, tier: "0" }]);
      expect(left.map((spell) => spell.id)).not.toContain(picked.id);
      expect(left.map((spell) => spell.id)).toContain(other.id);
      expect(left).toHaveLength(offered.length - 1);
    });

    test("lists each spell once when sibling extensions both carry it", async () => {
      const ctx = await getSeedCtx();
      const fork = await createSeededTestRulesetWithExtensions(SEED_USER_ID);
      expect((await sourcesOf(fork.id)).extensionIds.length).toBeGreaterThan(0);
      const { characterId } = await createCharacter(fork.id);
      const listNames = async (pool: string, classId: string, tier?: string) => {
        const answer = await expectOk(
          options.$post({
            param: { characterId, step: "spells" },
            query: { limit: "100" },
            json: { plan: { steps: { "class-plan": [{ track: classId, position: 1 }] } }, pool, tier },
          }),
        );
        return optionsOf(answer, false).items.map((p) => p.name);
      };

      const cantrips = await listNames(ctx.aptMap["Wizard Spells"], ctx.classMap.pc["Wizard"], "0");
      expect(cantrips.length).toBe(new Set(cantrips).size);

      // "Blackguard Spells" comes from the extensions (DMG and Complete Divine), not the
      // base. A spell only one extension's copy links to it must still show when another
      // extension's copy of that spell wins the dedup.
      const kinds = api.api.rulesets[":id"].entities[":entityType"];
      const [aptitude] = (
        await expectOk(
          kinds.$get({ param: { id: fork.id, entityType: "aptitudes" }, query: { search: "Blackguard Spells" } }),
        )
      ).items;
      const [klass] = (
        await expectOk(kinds.$get({ param: { id: fork.id, entityType: "classes" }, query: { search: "Blackguard" } }))
      ).items;
      const blackguard = await listNames(aptitude.id, klass.id);
      expect(blackguard.length).toBeGreaterThan(0);
      expect(blackguard.length).toBe(new Set(blackguard).size);
    });
  });

  describe("reading and editing a level", () => {
    test("reads a level's HP, skills and feats", async () => {
      const { characterId, ctx } = await createCharacter();
      const created = await addLevelOk(characterId, ctx.classMap.pc["Fighter"], 1, 7, fighter1(ctx));

      const data = await readLevel(characterId, created.id);
      expect(data).toMatchObject({
        editedLevelId: created.id,
        classId: ctx.classMap.pc["Fighter"],
        level: 1,
        hp: 7,
        abilityIncreases: [],
      });
      expect(data.skills).toMatchObject(fighter1(ctx).skills);
      expect([...(data.feats[ctx.aptMap["General"]] ?? [])].sort()).toEqual(
        [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]].sort(),
      );
      expect(data.feats[ctx.aptMap["Fighter Bonus Feat"]]).toEqual([ctx.featMap["Improved Initiative"]]);
    });

    test("refuses HP above the class's hit die", async () => {
      const { characterId, ctx } = await createCharacter();
      const created = await addLevelOk(characterId, ctx.classMap.pc["Fighter"], 1, 8, fighter1(ctx));
      const response = await level.$put({
        param: { characterId, advancementId: created.id },
        json: levelEditPlan({ hp: 11 }, fighter1(ctx)),
      });
      await expectStatus(response, 400);
    });

    test("refuses a feat its pool has no room for, forced or not", async () => {
      const { characterId, ctx } = await createCharacter();
      const levelPicks = fighter1(ctx);
      const general = ctx.aptMap["General"];
      const feats = { ...levelPicks.feats, [general]: [...levelPicks.feats[general], ctx.featMap["Toughness"]] };
      const response = addLevel(characterId, ctx.classMap.pc["Fighter"], 1, 8, { ...levelPicks, feats }, true);
      await expectStatus(response, 400);
    });

    test("saves a stacking feat a level picks twice, forced or not, and an edit that picks it twice", async () => {
      const { characterId, ctx } = await createCharacter();
      const levelPicks = fighter1(ctx);
      const general = ctx.aptMap["General"];
      const toughness = ctx.featMap["Toughness"];
      const feats = { ...levelPicks.feats, [general]: [toughness, toughness] };
      for (const force of [false, true]) {
        const { characterId: id } = await createCharacter();
        const [created] = await expectOk(
          addLevel(id, ctx.classMap.pc["Fighter"], 1, 8, { ...levelPicks, feats }, force),
        );
        const saved = await readLevel(id, created.id);
        expect(saved.feats[general]).toEqual([toughness, toughness]);
      }
      const created = await addLevelOk(characterId, ctx.classMap.pc["Fighter"], 1, 8, levelPicks);
      const param = { characterId, advancementId: created.id };
      await expectOk(level.$put({ param, json: levelEditPlan({ hp: 8 }, { ...levelPicks, feats }) }));
      expect((await readLevel(characterId, created.id)).feats[general]).toEqual([toughness, toughness]);
    });

    test("refuses a feat that doesn't stack a level picks twice", async () => {
      const { characterId, ctx } = await createCharacter();
      const levelPicks = fighter1(ctx);
      const powerAttack = ctx.featMap["Power Attack"];
      const feats = { ...levelPicks.feats, [ctx.aptMap["General"]]: [powerAttack, powerAttack] };
      await expectStatus(addLevel(characterId, ctx.classMap.pc["Fighter"], 1, 8, { ...levelPicks, feats }), 400);
    });

    test("refuses a class level beyond the rules' last", async () => {
      const { characterId, ctx } = await createCharacter();
      await expectStatus(addLevel(characterId, ctx.classMap.pc["Fighter"], 21, 8, fighter1(ctx)), 400);
    });

    test("edits an earlier level without touching the later ones", async () => {
      const { characterId, ctx } = await createCharacter();
      const first = await addLevelOk(characterId, ctx.classMap.pc["Fighter"], 1, 8, fighter1(ctx));
      const second = await addLevelOk(characterId, ctx.classMap.pc["Fighter"], 2, 6, fighter2(ctx));

      const skills = { ...fighter1(ctx).skills, [ctx.skillMap["Climb"]]: 2, [ctx.skillMap["Handle Animal"]]: 2 };
      await expectOk(
        level.$put({
          param: { characterId, advancementId: first.id },
          json: levelEditPlan({ hp: 7 }, { ...fighter1(ctx), skills }),
        }),
      );

      expect(await readLevel(characterId, first.id)).toMatchObject({
        hp: 7,
        skills: { [ctx.skillMap["Climb"]]: 2 },
      });
      const later = await readLevel(characterId, second.id);
      expect(later).toMatchObject({ hp: 6, skills: { [ctx.skillMap["Climb"]]: 1 } });
      expect(later.feats[ctx.aptMap["Fighter Bonus Feat"]]).toEqual([ctx.featMap["Dodge"]]);
    });

    test("frees the edited level's own picks in its feat pools", async () => {
      const { characterId, ctx } = await createCharacter();
      const classId = ctx.classMap.pc["Fighter"];
      const first = await addLevelOk(characterId, classId, 1, 8, fighter1(ctx));
      await addLevelOk(characterId, classId, 2, 6, fighter2(ctx));

      const general = async (plan: PlanRequest) =>
        poolNamed(stepOf(await planOk(characterId, plan), "feats", "pick"), "General")!;
      const editing = await general({ editedLevelId: first.id, steps: {} });
      // The next level's, which every saved level's picks count against
      const leveling = await general({ steps: { "class-plan": [{ track: classId, position: 3 }] } });
      // A human fighter 1 picks two General feats, which its edit picks again: none spent, both slots open
      expect([editing.available, editing.spent]).toEqual([2, 0]);
      expect(leveling.spent - editing.spent).toBe(2);
    });

    test("shows the Ranger's combat style pool when editing level 2, not level 1", async () => {
      const { characterId, ctx } = await createCharacter();
      const rangerId = ctx.classMap.pc["Ranger"];
      const skill = (names: string[], ranks: number) =>
        Object.fromEntries(names.map((name) => [ctx.skillMap[name], ranks]));

      // Ranger 1: (6+1+1)×4 = 32 skill points, 2 General feats and a favored enemy.
      const first = await addLevelOk(characterId, rangerId, 1, 8, {
        skills: skill(
          ["Hide", "Move Silently", "Listen", "Spot", "Survival", "Search", "Knowledge (Nature)", "Climb"],
          4,
        ),
        feats: {
          [ctx.aptMap["General"]]: [ctx.featMap["Point Blank Shot"], ctx.featMap["Toughness"]],
          [ctx.aptMap["Favored Enemy"]]: [ctx.featMap["Favored Enemy: Humanoid (Goblinoid)"]],
        },
        spells: {},
      });
      // Ranger 2: 8 skill points and a combat style pick.
      const secondPicks: Picks = {
        skills: skill(["Hide", "Move Silently", "Listen", "Spot", "Survival", "Climb", "Swim", "Search"], 1),
        feats: { [ctx.aptMap["Ranger Combat Style (2nd)"]]: [ctx.featMap["Rapid Shot"]] },
        spells: {},
      };
      const second = await addLevelOk(characterId, rangerId, 2, 7, secondPicks);

      const combatStyle = async (advancementId: string) => {
        const plan = await planOk(characterId, { editedLevelId: advancementId, steps: {} });
        return poolNamed(stepOf(plan, "feats", "pick"), "Ranger Combat Style (2nd)")?.available ?? 0;
      };
      expect(await combatStyle(second.id)).toBeGreaterThan(0);
      expect(await combatStyle(first.id)).toBe(0);

      await expectOk(
        level.$put({
          param: { characterId, advancementId: second.id },
          json: levelEditPlan({ hp: 5 }, secondPicks),
        }),
      );
      const edited = await readLevel(characterId, second.id);
      expect(edited.hp).toBe(5);
      expect(edited.feats[ctx.aptMap["Ranger Combat Style (2nd)"]]).toEqual([ctx.featMap["Rapid Shot"]]);
    });

    test("batch-added levels report character-wide pools and survive editing the middle one", async () => {
      // Regression: an edit's pools leave out only the level being edited (as
      // updateLevel does), so each pool is the character-wide total minus what the
      // other levels hold.
      const { characterId, ctx } = await createCharacter();
      const classId = ctx.classMap.pc["Fighter"];
      // General: 2 at level 1 (1 + Human), 1 at level 3. Fighter Bonus Feat: 1 at levels 1 and 2.
      const created = await expectOk(
        addLevels(
          characterId,
          [
            { classId, level: 1, hp: 8 },
            { classId, level: 2, hp: 6 },
            { classId, level: 3, hp: 6 },
          ],
          {
            skills: {
              [ctx.skillMap["Climb"]]: 6,
              [ctx.skillMap["Jump"]]: 6,
              [ctx.skillMap["Swim"]]: 6,
              [ctx.skillMap["Intimidate"]]: 6,
            },
            feats: {
              [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Cleave"], ctx.featMap["Toughness"]],
              [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"], ctx.featMap["Dodge"]],
            },
            spells: {},
          },
        ),
      );
      expect(created).toHaveLength(3);
      const [l1, l2, l3] = created;

      const pools = async (advancementId: string) => {
        const feats = stepOf(await planOk(characterId, { editedLevelId: advancementId, steps: {} }), "feats", "pick");
        return { general: poolNamed(feats, "General"), bonus: poolNamed(feats, "Fighter Bonus Feat") };
      };
      // Level 1 holds Power Attack, Cleave and Improved Initiative; level 2 Dodge; level 3 Toughness.
      expect(await pools(l1.id)).toMatchObject({
        general: { allowed: 3, available: 2 },
        bonus: { allowed: 2, available: 1 },
      });
      expect(await pools(l2.id)).toMatchObject({
        general: { allowed: 3, available: 0 },
        bonus: { allowed: 2, available: 1 },
      });
      expect(await pools(l3.id)).toMatchObject({
        general: { allowed: 3, available: 1 },
        bonus: { allowed: 2, available: 0 },
      });

      await expectOk(
        level.$put({
          param: { characterId, advancementId: l2.id },
          json: levelEditPlan(
            { hp: 4 },
            {
              skills: {
                [ctx.skillMap["Listen"]]: 1,
                [ctx.skillMap["Spot"]]: 1,
                [ctx.skillMap["Climb"]]: 1,
                [ctx.skillMap["Swim"]]: 1,
              },
              feats: { [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Combat Reflexes"]] },
              spells: {},
            },
          ),
        }),
      );
      const [after1, after2, after3] = [
        await readLevel(characterId, l1.id),
        await readLevel(characterId, l2.id),
        await readLevel(characterId, l3.id),
      ];
      expect(after2.hp).toBe(4);
      expect(after2.feats[ctx.aptMap["Fighter Bonus Feat"]]).toEqual([ctx.featMap["Combat Reflexes"]]);
      expect(after1.hp).toBe(8);
      expect(after1.feats[ctx.aptMap["Fighter Bonus Feat"]]).toContain(ctx.featMap["Improved Initiative"]);
      expect(after3.hp).toBe(6);
      expect(after3.feats[ctx.aptMap["General"]]).toContain(ctx.featMap["Toughness"]);
    });
  });

  describe("removing a level", () => {
    test("removes the last level", async () => {
      const { characterId, ctx } = await createCharacter();
      await addLevelOk(characterId, ctx.classMap.pc["Fighter"], 1, 8, fighter1(ctx));
      await addLevelOk(characterId, ctx.classMap.pc["Fighter"], 2, 6, fighter2(ctx));

      expect(await expectOk(levels.$delete({ param: { characterId } }))).toMatchObject({ success: true });
      const classes = await expectOk(
        options.$post({ param: { characterId, step: "class-plan" }, query: {}, json: { plan: { steps: {} } } }),
      );
      expect(optionsOf(classes, false).items.find((k) => k.id === ctx.classMap.pc["Fighter"])).toMatchObject({
        track: { next: 2 },
      });
    });

    test("returns 404 for a character without levels", async () => {
      const { characterId } = await createCharacter();
      await expectStatus(levels.$delete({ param: { characterId } }), 404);
    });
  });

  test("requires a session", async () => {
    const { characterId, ctx } = await createCharacter();
    const guest = guestApi.api.characters.levels[":characterId"];
    const plan = levelUpPlan([{ classId: ctx.classMap.pc["Fighter"], level: 1, hp: 8 }]);
    const characterLevel = { characterId, advancementId: NIL_UUID };
    const responses = await Promise.all([
      guest.steps.$get({ param: { characterId }, query: {} }),
      guest.plan.$post({ param: { characterId }, json: plan }),
      guest.options[":step"].$post({ param: { characterId, step: "class-plan" }, query: {}, json: { plan } }),
      guest.$post({ param: { characterId }, json: plan }),
      guest[":advancementId"].plan.$get({ param: characterLevel }),
      guest[":advancementId"].$put({ param: characterLevel, json: levelEditPlan({ hp: 5 }) }),
      guest.$delete({ param: { characterId } }),
    ]);
    for (const response of responses) await expectStatus(response, 401);
  });

  test("returns 404 for a missing character or character level", async () => {
    const { characterId, ctx } = await createCharacter();
    const classId = ctx.classMap.pc["Fighter"];
    const missing = { characterId: NIL_UUID };
    const plan = levelUpPlan([{ classId, level: 1, hp: 8 }]);

    await expectStatus(options.$post({ param: { ...missing, step: "class-plan" }, query: {}, json: { plan } }), 404);
    await expectStatus(levels.steps.$get({ param: missing, query: {} }), 404);
    await expectStatus(levels.plan.$post({ param: missing, json: plan }), 404);
    await expectStatus(
      options.$post({ param: { ...missing, step: "feats" }, query: {}, json: { plan, pool: ctx.aptMap["General"] } }),
      404,
    );
    await expectStatus(addLevel(NIL_UUID, classId, 1, 8, {}), 404);
    await expectStatus(levels.$delete({ param: missing }), 404);
    const characterLevel = { characterId, advancementId: NIL_UUID };
    await expectStatus(level.plan.$get({ param: characterLevel }), 404);
    await expectStatus(level.$put({ param: characterLevel, json: levelEditPlan({ hp: 5 }) }), 404);
  });
});
