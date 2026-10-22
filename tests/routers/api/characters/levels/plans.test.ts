import { describe, expect, test } from "bun:test";

import type { InferResponseType } from "hono/client";

import { type SeedContext } from "@/scripts/db/seeds/seedContext.ts";
import { api, expectOk, expectStatus } from "@/tests/support/api.ts";
import { postCharacter } from "@/tests/support/characters.ts";
import { FIGHTER_LEVELS, picks, type Picks, SORCERER_1 } from "@/tests/support/dnd3.5/levelFixtures.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

/** A plan's answer, as the API answers it. */
type PlanAnswer = InferResponseType<(typeof levels)["plan"]["$post"], 200>;

/** A step's answer, any mechanic's. */
type StepAnswer = PlanAnswer["steps"][string];

/** A page of a step's options, as the API answers it: of any kind, its rows groups or not. */
type StepOptions = InferResponseType<(typeof levels)["options"][":step"]["$post"], 200>;

const levels = api.api.characters.levels[":characterId"];
const level = levels[":characterLevelId"];

/** A plan's fighter levels (`count`), from the first, with their hit points. */
function fighterPlan(ctx: SeedContext, count: number) {
  const plans = FIGHTER_LEVELS.slice(0, count);
  return {
    "class-plan": plans.map((_, i) => ({ track: ctx.klassMap.pc["Fighter"], position: i + 1 })),
    hp: plans.map((plan) => plan.hp),
  };
}

/** A page of options of `kind`, its rows groups (`grouped`) or not: refused when it's another's. */
function optionsOf<K extends StepOptions["kind"], G extends boolean>(options: StepOptions, kind: K, grouped: G) {
  if (options.kind !== kind || options.grouped !== grouped)
    throw new Error(`The options are ${options.kind}'s (grouped: ${options.grouped}), not ${kind}'s`);
  return options as Extract<StepOptions, { grouped: G; kind: K }>;
}

/** A level's picks as a plan's payloads: its skills' points, and its feats and powers, each in its pool. */
function payloadsOf({ feats, powers, skills }: Picks) {
  const picked = (byPool: Record<string, string[]>) =>
    Object.entries(byPool).flatMap(([pool, ids]) => ids.map((id) => ({ id, pool })));
  return {
    skills: Object.entries(skills).map(([id, points]) => ({ id, points })),
    feats: picked(feats),
    powers: picked(powers),
  };
}

/** The answer of step `name`, of mechanic `mechanic`: refused when the plan answered it by another. */
function stepOf<M extends StepAnswer["mechanic"]>(answer: PlanAnswer, name: string, mechanic: M) {
  const step = answer.steps[name];
  if (step?.mechanic !== mechanic) throw new Error(`The ${name} step answered as ${step?.mechanic}, not ${mechanic}`);
  return step as Extract<StepAnswer, { mechanic: M }>;
}

/** A new human character of the seeded user's (INT 12, CHA 8 for a fighter; CHA 16 for a sorcerer). */
async function createCharacter(charisma = 8) {
  const ctx = await getSeedCtx();
  const scores: Record<string, number> = {
    Strength: 16,
    Dexterity: 14,
    Constitution: 14,
    Intelligence: 12,
    Wisdom: 10,
    Charisma: charisma,
  };
  const abilities = Object.fromEntries(Object.entries(scores).map(([name, score]) => [ctx.abilityMap[name], score]));
  const character = await postCharacter({ abilities, alignment: "Neutral Good" });
  return { characterId: character.id, ctx };
}

describe("character level plans", () => {
  test("lists a level's steps by their mechanics, an edit's without its class plan", async () => {
    const { characterId, ctx } = await createCharacter();
    const steps = await expectOk(levels.steps.$get({ param: { characterId }, query: {} }));
    expect(steps.map(({ mechanic, name }) => [name, mechanic])).toEqual([
      ["class-plan", "plan"],
      ["hp", "value"],
      ["abilities", "choose"],
      ["skills", "spend"],
      ["feats", "pick"],
      ["powers", "pick"],
    ]);

    const [created] = await expectOk(
      levels.$post({
        param: { characterId },
        json: { steps: { ...fighterPlan(ctx, 1), ...payloadsOf(picks(ctx, FIGHTER_LEVELS[0])) } },
      }),
    );
    const edited = await expectOk(levels.steps.$get({ param: { characterId }, query: { editedLevelId: created.id } }));
    expect(edited.map(({ name }) => name)).toEqual(["hp", "abilities", "skills", "feats", "powers"]);
  });

  test("answers a level-up's plan as its preview does, each step by its mechanic", async () => {
    const { characterId, ctx } = await createCharacter();
    const fighter = ctx.klassMap.pc["Fighter"];
    const general = ctx.aptMap["General"];
    const powerAttack = ctx.featMap["Power Attack"];
    const plan = await expectOk(
      levels.plan.$post({
        param: { characterId },
        json: { steps: { ...fighterPlan(ctx, 2), feats: [{ id: powerAttack, pool: general }] } },
      }),
    );
    const preview = await expectOk(
      levels.preview.$post({
        param: { characterId },
        json: {
          levels: [
            { klassId: fighter, level: 1 },
            { klassId: fighter, level: 2 },
          ],
          feats: { [general]: [powerAttack] },
        },
      }),
    );

    expect(plan.advancements.map(({ position, track }) => [track.id, position])).toEqual([
      [fighter, 1],
      [fighter, 2],
    ]);
    // A fighter's d10: 1 to 10, 5 between
    expect(stepOf(plan, "hp", "value").advancements).toEqual([
      { average: 5, max: 10, min: 1, roll: "d10" },
      { average: 5, max: 10, min: 1, roll: "d10" },
    ]);
    // Neither level takes an ability increase
    expect(stepOf(plan, "abilities", "choose")).toMatchObject({ advancements: [], amount: 1, chosen: true });
    // Human Fighter 1–2, INT 12: 16 + 4 skill points
    const skills = stepOf(plan, "skills", "spend");
    expect(skills).toMatchObject({ budget: 20, perAdvancement: [16, 4] });
    expect(skills.rows.map(({ id, value }) => [id, value])).toEqual(
      preview.skills.skills.map(({ id, ranks }) => [id, ranks]),
    );
    // 2 General feats and 2 Fighter Bonus Feats, Power Attack taking one, on the first level
    const feats = stepOf(plan, "feats", "pick");
    expect(feats).toMatchObject({ fitted: { [general]: [powerAttack] }, grouped: true });
    expect(Object.values(feats.pools).map(({ available, name }) => [name, available])).toEqual(
      Object.values(preview.feats.aptitudePools).map(({ available, name }) => [name, available]),
    );
    expect(feats.next).toEqual(
      Object.fromEntries(Object.entries(preview.nextPickLevels.feats).map(([pool, index]) => [pool, { "": index }])),
    );
    expect(stepOf(plan, "powers", "pick")).toMatchObject({ grouped: false, pools: {} });
  });

  test("answers an edit's level as its steps do, in the level's place", async () => {
    const { characterId, ctx } = await createCharacter();
    const fighter1 = picks(ctx, FIGHTER_LEVELS[0]);
    const [created] = await expectOk(
      levels.$post({ param: { characterId }, json: { steps: { ...fighterPlan(ctx, 1), ...payloadsOf(fighter1) } } }),
    );
    const plan = await expectOk(
      levels.plan.$post({
        param: { characterId },
        json: { editedLevelId: created.id, steps: { hp: [8], ...payloadsOf(fighter1) } },
      }),
    );
    const query = { classId: ctx.klassMap.pc["Fighter"], editedLevelId: created.id, level: "1" };
    const stepSkills = await expectOk(
      levels["level-steps"][":step"].$get({ param: { characterId, step: "skills" }, query }),
    );

    expect(plan.advancements).toEqual([
      { id: expect.any(String), position: 1, track: { id: ctx.klassMap.pc["Fighter"], name: "Fighter" } },
    ]);
    expect(plan.steps["class-plan"]).toBeUndefined();
    expect(stepOf(plan, "hp", "value").advancements).toEqual([{ average: 5, max: 10, min: 1, roll: "d10" }]);
    if (stepSkills.name !== "skills") throw new Error("The skills step answered for another");
    expect(stepOf(plan, "skills", "spend")).toMatchObject({
      budget: stepSkills.skillPointsToSpend,
      perAdvancement: [16],
    });
    // The level's own feats stay picked, its pools' room theirs, as its steps count it
    const feats = stepOf(plan, "feats", "pick");
    expect(feats.fitted).toEqual(fighter1.feats);
    expect(feats.pools[ctx.aptMap["General"]]).toMatchObject({ allowed: 2, available: 2, spent: 0 });
  });

  test("opens each step's picker over the plan: its classes, a pool's feats grouped and a family's, and spells by tier", async () => {
    const { characterId, ctx } = await createCharacter();
    const fighter = ctx.klassMap.pc["Fighter"];
    const general = ctx.aptMap["General"];
    const options = levels.options[":step"];
    const empty = { steps: {} };

    const classes = await expectOk(
      options.$post({ param: { characterId, step: "class-plan" }, query: {}, json: { plan: empty } }),
    );
    expect(optionsOf(classes, "klasses", false).items.find((klass) => klass.id === fighter)).toMatchObject({
      nextLevel: 1,
      eligible: true,
    });

    // Cleave needs Power Attack: picked in the plan, it's eligible
    const plan = { steps: { ...fighterPlan(ctx, 1), feats: [{ id: ctx.featMap["Power Attack"], pool: general }] } };
    const cleave = await expectOk(
      options.$post({
        param: { characterId, step: "feats" },
        query: { search: "Cleave" },
        json: { plan, pool: general },
      }),
    );
    expect(optionsOf(cleave, "feats", true).items.find((row) => row.displayName === "Cleave")).toMatchObject({
      eligible: true,
    });

    // A family's members, one row each, as the feats' own picker lists them
    const json = { plan: { steps: fighterPlan(ctx, 1) }, pool: general };
    const focus = await expectOk(
      options.$post({ param: { characterId, step: "feats" }, query: { search: "Weapon Focus" }, json }),
    );
    const family = optionsOf(focus, "feats", true).items.find((row) => row.family !== null);
    if (!family?.family) throw new Error("No feat family found");
    const members = await expectOk(
      options.$post({
        param: { characterId, step: "feats" },
        query: { limit: "50" },
        json: { ...json, group: family.family },
      }),
    );
    const listed = await expectOk(
      levels["available-feats"].$get({
        param: { characterId },
        query: { aptitudeId: general, classId: fighter, family: family.family, level: "1", limit: "50" },
      }),
    );
    expect(optionsOf(members, "feats", false).items.map(({ id }) => id)).toEqual(listed.items.map(({ id }) => id));

    // A sorcerer's cantrips, at tier 0
    const sorcerer = await createCharacter(16);
    const sorcererSpells = sorcerer.ctx.aptMap["Sorcerer Spells"];
    const sorcererPlan = { steps: { "class-plan": [{ track: sorcerer.ctx.klassMap.pc["Sorcerer"], position: 1 }] } };
    const cantrips = await expectOk(
      options.$post({
        param: { characterId: sorcerer.characterId, step: "powers" },
        query: { limit: "50" },
        json: { plan: sorcererPlan, pool: sorcererSpells, tier: "0" },
      }),
    );
    const cantripsListed = await expectOk(
      levels["available-powers"].$get({
        param: { characterId: sorcerer.characterId },
        query: {
          aptitudeId: sorcererSpells,
          classId: sorcerer.ctx.klassMap.pc["Sorcerer"],
          level: "1",
          limit: "50",
          powerLevel: "0",
        },
      }),
    );
    const cantripIds = optionsOf(cantrips, "powers", false).items.map(({ id }) => id);
    expect(cantripIds).toEqual(cantripsListed.items.map(({ id }) => id));
    expect(cantripIds).toContain(sorcerer.ctx.powerMap["Detect Magic"]);
    // A plan's spells picked so far stay out
    const withPicked = {
      steps: {
        ...sorcererPlan.steps,
        powers: [{ id: sorcerer.ctx.powerMap["Detect Magic"], pool: sorcererSpells, tier: "0" }],
      },
    };
    const rest = await expectOk(
      options.$post({
        param: { characterId: sorcerer.characterId, step: "powers" },
        query: { limit: "50" },
        json: { plan: withPicked, pool: sorcererSpells, tier: "0" },
      }),
    );
    expect(optionsOf(rest, "powers", false).items.map(({ id }) => id)).not.toContain(
      sorcerer.ctx.powerMap["Detect Magic"],
    );
  });

  test("saves a level-up's plan as the levels it writes, and an edit's as the level's", async () => {
    const { characterId, ctx } = await createCharacter();
    const fighter1 = picks(ctx, FIGHTER_LEVELS[0]);
    const [created] = await expectOk(
      levels.$post({ param: { characterId }, json: { steps: { ...fighterPlan(ctx, 1), ...payloadsOf(fighter1) } } }),
    );
    const param = { characterId, characterLevelId: created.id };
    expect(await expectOk(level.$get({ param }))).toMatchObject({
      hp: FIGHTER_LEVELS[0].hp,
      klassId: ctx.klassMap.pc["Fighter"],
      level: 1,
      skills: fighter1.skills,
    });

    const edit = {
      hp: [5],
      skills: [
        { id: ctx.skillMap["Climb"], points: 4 },
        { id: ctx.skillMap["Swim"], points: 4 },
        { id: ctx.skillMap["Jump"], points: 4 },
        { id: ctx.skillMap["Handle Animal"], points: 4 },
      ],
      feats: [
        { id: ctx.featMap["Power Attack"], pool: ctx.aptMap["General"] },
        { id: ctx.featMap["Toughness"], pool: ctx.aptMap["General"] },
        { id: ctx.featMap["Combat Reflexes"], pool: ctx.aptMap["Fighter Bonus Feat"] },
      ],
    };
    await expectOk(level.$put({ param, json: { steps: edit } }));
    const saved = await expectOk(level.$get({ param }));
    expect(saved).toMatchObject({ hp: 5, skills: { [ctx.skillMap["Handle Animal"]]: 4 } });
    expect(saved.feats[ctx.aptMap["Fighter Bonus Feat"]]?.map(({ id }) => id)).toEqual([
      ctx.featMap["Combat Reflexes"],
    ]);
  });

  test("saves a sorcerer's spells picked by tier, each in its pool", async () => {
    const { characterId, ctx } = await createCharacter(16);
    const sorcerer1 = picks(ctx, SORCERER_1);
    const steps = {
      "class-plan": [{ track: ctx.klassMap.pc["Sorcerer"], position: 1 }],
      hp: [SORCERER_1.hp],
      ...payloadsOf(sorcerer1),
    };
    const [created] = await expectOk(levels.$post({ param: { characterId }, json: { steps } }));
    const saved = await expectOk(level.$get({ param: { characterId, characterLevelId: created.id } }));
    expect(saved.powers[ctx.aptMap["Sorcerer Spells"]]?.map(({ id }) => id).sort()).toEqual(
      [...(sorcerer1.powers[ctx.aptMap["Sorcerer Spells"]] ?? [])].sort(),
    );
  });

  test("refuses a step the level hasn't, an answer in another mechanic's shape, and a save without hit points", async () => {
    const { characterId, ctx } = await createCharacter();
    const plan = fighterPlan(ctx, 1);
    await expectStatus(levels.plan.$post({ param: { characterId }, json: { steps: { ...plan, bonus: [1] } } }), 400);
    await expectStatus(levels.plan.$post({ param: { characterId }, json: { steps: { ...plan, hp: [[]] } } }), 400);
    await expectStatus(levels.plan.$post({ param: { characterId }, json: { steps: { hp: [8] } } }), 400);
    await expectStatus(
      levels.$post({ param: { characterId }, json: { steps: { "class-plan": plan["class-plan"] } } }),
      400,
    );
    await expectStatus(
      levels.options[":step"].$post({ param: { characterId, step: "hp" }, query: {}, json: { plan: { steps: plan } } }),
      404,
    );
  });
});
