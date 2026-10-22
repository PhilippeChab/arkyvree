import { describe, expect, test } from "bun:test";

import type { InferResponseType } from "hono/client";

import { type SeedContext } from "@/scripts/db/seeds/seedContext.ts";
import { api, expectOk, expectStatus } from "@/tests/support/api.ts";
import { postCharacter } from "@/tests/support/characters.ts";
import { FIGHTER_LEVELS, picks, type Picks, SORCERER_1 } from "@/tests/support/dnd3.5/levelFixtures.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

/** A plan's answer, as the API answers it. */
type PlanAnswer = InferResponseType<(typeof levels)["plan"]["$post"], 200>;

/** A pool step's pools, as today's preview and steps answer them. */
type PoolsAnswer = Preview["feats"]["aptitudePools"] | Preview["powers"]["aptitudePools"];

/** Add Level's preview, as today's route answers it. */
type Preview = InferResponseType<(typeof levels)["preview"]["$post"], 200>;

/** A step's answer, any mechanic's. */
type StepAnswer = PlanAnswer["steps"][string];

/** A page of a step's options, as the API answers it: of any kind, its rows groups or not. */
type StepOptions = InferResponseType<(typeof levels)["options"][":step"]["$post"], 200>;

const levels = api.api.characters.levels[":characterId"];
const level = levels[":characterLevelId"];

/** Today's pools (`pools`) as a `pick` step's: a shared feat pool optional, a leveled spell pool by its tiers. */
function expectedPools(pools: PoolsAnswer) {
  return Object.fromEntries(
    Object.entries(pools).map(([id, pool]) => [
      id,
      {
        allowed: pool.allowed,
        available: pool.available,
        id: pool.id,
        name: pool.name,
        optional: "shared" in pool ? pool.shared : false,
        spent: pool.spent,
        ...("leveled" in pool && pool.leveled && pool.levels && { tiers: pool.levels }),
      },
    ]),
  );
}

/** Today's skills step (`skills`) as a `spend` step's, with the points each planned level gives. */
function expectedSpend(skills: Preview["skills"], perAdvancement: number[]) {
  return {
    mechanic: "spend" as const,
    budget: skills.skillPointsToSpend,
    perAdvancement,
    rows: skills.skills.map((skill) => ({
      current: skill.currentRank,
      description: skill.description,
      favored: skill.classSkill,
      group: skill.family,
      id: skill.id,
      maxPoints: skill.maxPoints,
      name: skill.name,
      points: skill.points,
      shortName: skill.shortName,
      step: skill.rankStep,
      value: skill.ranks,
      valuesByPoints: skill.ranksByPoints,
    })),
  };
}

/** A plan's fighter levels (`count`), from the first, with their hit points and no ability increase. */
function fighterPlan(ctx: SeedContext, count: number) {
  const plans = FIGHTER_LEVELS.slice(0, count);
  return {
    "class-plan": plans.map((_, i) => ({ track: ctx.klassMap.pc["Fighter"], position: i + 1 })),
    hp: plans.map((plan) => plan.hp),
    abilities: plans.map(() => []),
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

/** What fits of a pick step's picks (`fitted`), as its answer names them: each by its id, in pick order. */
function pickedOf(fitted: Record<string, string[]>) {
  return Object.fromEntries(
    Object.entries(fitted).map(([pool, ids]) => [
      pool,
      ids.map((id) => expect.objectContaining({ id, name: expect.any(String) })),
    ]),
  );
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
    // Each in its words: what the wizard shows past its label and its kind's word
    expect(steps.find(({ name }) => name === "hp")?.words).toEqual({ prompt: "Set HP for", unit: "HP Gain" });
    expect(steps.find(({ name }) => name === "class-plan")?.words).toMatchObject({
      position: { many: "Levels", one: "Level" },
    });
    expect(steps.find(({ name }) => name === "powers")?.words).toMatchObject({
      grantNote: "class ability",
      tiers: { "0": "Cantrips", "1": "Level 1" },
    });
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
        json: { editedLevelId: created.id, steps: { hp: [8], abilities: [[]], ...payloadsOf(fighter1) } },
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
      abilities: [[]],
      powers: [],
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
      abilities: [[]],
      ...payloadsOf(sorcerer1),
    };
    const [created] = await expectOk(levels.$post({ param: { characterId }, json: { steps } }));
    const saved = await expectOk(level.$get({ param: { characterId, characterLevelId: created.id } }));
    expect(saved.powers[ctx.aptMap["Sorcerer Spells"]]?.map(({ id }) => id).sort()).toEqual(
      [...(sorcerer1.powers[ctx.aptMap["Sorcerer Spells"]] ?? [])].sort(),
    );
  });

  test("refuses a step the level hasn't, an answer in another mechanic's shape, an unanswered step, and a level without hit points", async () => {
    const { characterId, ctx } = await createCharacter();
    const plan = fighterPlan(ctx, 1);
    await expectStatus(levels.plan.$post({ param: { characterId }, json: { steps: { ...plan, bonus: [1] } } }), 400);
    await expectStatus(levels.plan.$post({ param: { characterId }, json: { steps: { ...plan, hp: [[]] } } }), 400);
    await expectStatus(levels.plan.$post({ param: { characterId }, json: { steps: { hp: [8] } } }), 400);
    await expectStatus(
      levels.$post({ param: { characterId }, json: { steps: { "class-plan": plan["class-plan"] } } }),
      400,
    );
    // Its hit points answered, but not the level's
    const noHp = levels.$post({
      param: { characterId },
      json: { steps: { ...plan, ...payloadsOf(picks(ctx, FIGHTER_LEVELS[0])), hp: [] } },
    });
    expect(await (await expectStatus(noHp, 400)).json()).toMatchObject({
      message: "Level 1: its hit points are required",
    });
    await expectStatus(
      levels.options[":step"].$post({ param: { characterId, step: "hp" }, query: {}, json: { plan: { steps: plan } } }),
      404,
    );
  });

  test("answers every step of a level-up's plan as its preview does: a fourth level's increase, a sorcerer's tiers", async () => {
    const { characterId, ctx } = await createCharacter();
    const fighter = ctx.klassMap.pc["Fighter"];
    // Three fighter levels saved, one at a time; the fourth planned, with its increase
    for (const [i, plan] of FIGHTER_LEVELS.slice(0, 3).entries()) {
      const steps = {
        "class-plan": [{ track: fighter, position: i + 1 }],
        hp: [plan.hp],
        abilities: [[]],
        ...payloadsOf(picks(ctx, plan)),
      };
      await expectOk(levels.$post({ param: { characterId }, json: { steps } }));
    }
    const strength = ctx.abilityMap["Strength"];
    const fourth = await expectOk(
      levels.plan.$post({
        param: { characterId },
        json: {
          steps: {
            "class-plan": [{ track: fighter, position: 4 }],
            abilities: [[{ id: strength, amount: 1 }]],
            skills: [{ id: ctx.skillMap["Climb"], points: 1 }],
          },
        },
      }),
    );
    const preview: Preview = await expectOk(
      levels.preview.$post({
        param: { characterId },
        json: {
          levels: [{ klassId: fighter, level: 4, abilityIncreases: [{ abilityId: strength, amount: 1 }] }],
          skills: { [ctx.skillMap["Climb"]]: 1 },
        },
      }),
    );
    expect(stepOf(fourth, "abilities", "choose")).toEqual({
      mechanic: "choose",
      advancements: [0],
      amount: 1,
      chosen: true,
      options: preview.attributes.attributes.map(({ abbreviation, abilityId, modifier, name, total }) => ({
        abbreviation,
        id: abilityId,
        modifier,
        name,
        score: total,
      })),
    });
    expect(stepOf(fourth, "skills", "spend")).toEqual(expectedSpend(preview.skills, preview.perLevelSkillPoints));

    // A sorcerer's first level, two cantrips picked: its pools by spell level, its grants, where each pick lands
    const sorcerer = await createCharacter(16);
    const sorcererClass = sorcerer.ctx.klassMap.pc["Sorcerer"];
    const sorcererSpells = sorcerer.ctx.aptMap["Sorcerer Spells"];
    const cantrips = ["Detect Magic", "Light"].map((name) => sorcerer.ctx.powerMap[name]);
    const plan = await expectOk(
      levels.plan.$post({
        param: { characterId: sorcerer.characterId },
        json: {
          steps: {
            "class-plan": [{ track: sorcererClass, position: 1 }],
            powers: cantrips.map((id) => ({ id, pool: sorcererSpells, tier: "0" })),
          },
        },
      }),
    );
    const sorcererPreview: Preview = await expectOk(
      levels.preview.$post({
        param: { characterId: sorcerer.characterId },
        json: { levels: [{ klassId: sorcererClass, level: 1 }], powers: { [sorcererSpells]: cantrips } },
      }),
    );
    const { powers } = sorcererPreview;
    expect(stepOf(plan, "powers", "pick")).toEqual({
      mechanic: "pick",
      fitted: powers.fitted,
      picked: pickedOf(powers.fitted),
      granted: powers.autoGrantedPowers.map(({ description, free, id, name }) => ({ description, free, id, name })),
      grouped: false,
      next: sorcererPreview.nextPickLevels.powers,
      pools: expectedPools(powers.aptitudePools),
    });
    expect(stepOf(plan, "powers", "pick").pools[sorcererSpells]?.tiers?.["0"]).toMatchObject({ spent: 0 });
    // The cantrips picked, by name, at their tier
    expect(stepOf(plan, "powers", "pick").picked[sorcererSpells]).toEqual([
      expect.objectContaining({ id: cantrips[0], name: "Detect Magic", tier: "0" }),
      expect.objectContaining({ id: cantrips[1], name: "Light", tier: "0" }),
    ]);
    expect(stepOf(plan, "feats", "pick")).toEqual({
      mechanic: "pick",
      fitted: sorcererPreview.feats.fitted,
      picked: pickedOf(sorcererPreview.feats.fitted),
      granted: sorcererPreview.feats.autoGrantedFeats.map(({ description, id, name }) => ({
        description,
        free: false,
        id,
        name,
      })),
      grouped: true,
      next: Object.fromEntries(
        Object.entries(sorcererPreview.nextPickLevels.feats).map(([pool, index]) => [pool, { "": index }]),
      ),
      pools: expectedPools(sorcererPreview.feats.aptitudePools),
    });
  });

  test("answers every step of an edit's level as its steps do, each pool's next pick on the level", async () => {
    const { characterId, ctx } = await createCharacter(16);
    const sorcerer1 = picks(ctx, SORCERER_1);
    const sorcererClass = ctx.klassMap.pc["Sorcerer"];
    const steps = {
      "class-plan": [{ track: sorcererClass, position: 1 }],
      hp: [SORCERER_1.hp],
      abilities: [[]],
      ...payloadsOf(sorcerer1),
    };
    const [created] = await expectOk(levels.$post({ param: { characterId }, json: { steps } }));
    const payloads = payloadsOf(sorcerer1);
    const plan = await expectOk(
      levels.plan.$post({
        param: { characterId },
        json: { editedLevelId: created.id, steps: { hp: [4], abilities: [[]], ...payloads } },
      }),
    );
    const pairs = (picked: { id: string; pool: string }[]) => picked.map(({ id, pool }) => `${id}:${pool}`).join(",");
    const query = {
      classId: sorcererClass,
      editedLevelId: created.id,
      level: "1",
      featPicks: pairs(payloads.feats),
      powerPicks: pairs(payloads.powers),
      skillPoints: payloads.skills.map(({ id, points }) => `${id}:${points}`).join(","),
    };
    const stepAt = (name: string) =>
      expectOk(levels["level-steps"][":step"].$get({ param: { characterId, step: name }, query }));
    const [abilities, skills, feats, powers] = await Promise.all(
      ["abilities", "skills", "feats", "powers"].map(stepAt),
    );
    if (
      abilities.name !== "abilities" ||
      skills.name !== "skills" ||
      feats.name !== "feats" ||
      powers.name !== "powers"
    )
      throw new Error("A step answered for another");

    const atLevel = (pools: PoolsAnswer) =>
      Object.fromEntries(
        Object.entries(pools).map(([id, pool]) => [
          id,
          {
            "": 0,
            ...Object.fromEntries(Object.keys(("levels" in pool && pool.levels) || {}).map((tier) => [tier, 0])),
          },
        ]),
      );
    expect(plan.steps).toEqual({
      hp: { mechanic: "value", advancements: [{ average: 2, max: 4, min: 1, roll: "d4" }] },
      abilities: {
        mechanic: "choose",
        advancements: [],
        amount: 1,
        chosen: abilities.picked,
        options: [],
      },
      skills: expectedSpend(skills, [skills.skillPointsToSpend]),
      feats: {
        mechanic: "pick",
        fitted: feats.fitted,
        picked: pickedOf(feats.fitted),
        granted: feats.autoGrantedFeats.map(({ description, id, name }) => ({ description, free: false, id, name })),
        grouped: true,
        next: atLevel(feats.aptitudePools),
        pools: expectedPools(feats.aptitudePools),
      },
      powers: {
        mechanic: "pick",
        fitted: powers.fitted,
        picked: pickedOf(powers.fitted),
        granted: powers.autoGrantedPowers.map(({ description, free, id, name }) => ({ description, free, id, name })),
        grouped: false,
        next: atLevel(powers.aptitudePools),
        pools: expectedPools(powers.aptitudePools),
      },
    });
    expect(Object.keys(stepOf(plan, "powers", "pick").next[ctx.aptMap["Sorcerer Spells"]] ?? {})).toContain("0");
  });

  test("opens a pool's picker at the level its pick lands on, the plan's levels before and after it, and an edit's at its level", async () => {
    const { characterId, ctx } = await createCharacter();
    const general = ctx.aptMap["General"];
    const options = levels.options[":step"];
    const fighterRanger = {
      ...fighterPlan(ctx, 1),
      "class-plan": [
        { track: ctx.klassMap.pc["Fighter"], position: 1 },
        { track: ctx.klassMap.pc["Ranger"], position: 1 },
      ],
    };
    const track = async (steps: Record<string, unknown>, advancement: number) => {
      const answer = await expectOk(
        options.$post({
          param: { characterId, step: "feats" },
          query: { search: "Track" },
          json: { plan: { steps: steps as typeof fighterRanger }, pool: general, advancement },
        }),
      );
      return optionsOf(answer, "feats", true).items.map(({ displayName }) => displayName);
    };
    // The ranger's level after it grants Track: the fighter's level leaves it out
    expect(await track(fighterPlan(ctx, 1), 0)).toEqual(["Track"]);
    expect(await track(fighterRanger, 0)).toEqual([]);
    // The ranger's own level, after the fighter's: it grants Track, which its picker leaves out too
    expect(await track(fighterRanger, 1)).toEqual([]);
    expect(await track({ ...fighterRanger, "class-plan": [fighterRanger["class-plan"][1]] }, 0)).toEqual([]);
    // A level the plan hasn't
    const pastPlan = options.$post({
      param: { characterId, step: "feats" },
      query: {},
      json: { plan: { steps: fighterRanger }, pool: general, advancement: 2 },
    });
    await expectStatus(pastPlan, 400);

    // The class plan's picker over a planned fighter level: its options numbered by the saved levels, which the wizard
    // counts the planned ones past
    const classes = await expectOk(
      options.$post({
        param: { characterId, step: "class-plan" },
        query: {},
        json: { plan: { steps: fighterPlan(ctx, 1) } },
      }),
    );
    expect(
      optionsOf(classes, "klasses", false).items.find(({ id }) => id === ctx.klassMap.pc["Fighter"]),
    ).toMatchObject({ eligible: true, nextLevel: 1 });

    // An edit's: at its level, Cleave eligible with the level's Power Attack, not without it
    const fighter1 = picks(ctx, FIGHTER_LEVELS[0]);
    const [created] = await expectOk(
      levels.$post({ param: { characterId }, json: { steps: { ...fighterPlan(ctx, 1), ...payloadsOf(fighter1) } } }),
    );
    const cleave = async (feats: { id: string; pool: string }[]) => {
      const answer = await expectOk(
        options.$post({
          param: { characterId, step: "feats" },
          query: { search: "Cleave" },
          json: { plan: { editedLevelId: created.id, steps: { feats } }, pool: general },
        }),
      );
      return optionsOf(answer, "feats", true).items.find(({ displayName }) => displayName === "Cleave")?.eligible;
    };
    expect(await cleave(payloadsOf(fighter1).feats)).toBe(true);
    expect(await cleave([])).toBe(false);
  });

  test("saves a level's increase, refuses an unanswered step, and an unmet requirement unless forced", async () => {
    const { characterId, ctx } = await createCharacter();
    const fighter = ctx.klassMap.pc["Fighter"];
    for (const [i, plan] of FIGHTER_LEVELS.slice(0, 3).entries()) {
      const steps = {
        "class-plan": [{ track: fighter, position: i + 1 }],
        hp: [plan.hp],
        abilities: [[]],
        ...payloadsOf(picks(ctx, plan)),
      };
      await expectOk(levels.$post({ param: { characterId }, json: { steps } }));
    }
    const fourth = {
      "class-plan": [{ track: fighter, position: 4 }],
      hp: [FIGHTER_LEVELS[3].hp],
      abilities: [[{ id: ctx.abilityMap["Strength"], amount: 1 }]],
      ...payloadsOf(picks(ctx, FIGHTER_LEVELS[3])),
    };
    // Its spells left unanswered: refused, rather than read as none
    const { powers: _, ...unanswered } = fourth;
    await expectStatus(levels.$post({ param: { characterId }, json: { steps: unanswered } }), 400);
    const [created] = await expectOk(levels.$post({ param: { characterId }, json: { steps: fourth } }));
    expect(await expectOk(level.$get({ param: { characterId, characterLevelId: created.id } }))).toMatchObject({
      abilityIncreases: [{ abilityId: ctx.abilityMap["Strength"], amount: 1 }],
    });

    // A first level picking Cleave without Power Attack: refused, saved when forced
    const other = await createCharacter();
    const cleave = {
      ...fighterPlan(other.ctx, 1),
      ...payloadsOf(picks(other.ctx, FIGHTER_LEVELS[0])),
      feats: [
        { id: other.ctx.featMap["Cleave"], pool: other.ctx.aptMap["General"] },
        { id: other.ctx.featMap["Great Fortitude"], pool: other.ctx.aptMap["General"] },
        { id: other.ctx.featMap["Improved Initiative"], pool: other.ctx.aptMap["Fighter Bonus Feat"] },
      ],
    };
    const param = { characterId: other.characterId };
    await expectStatus(levels.$post({ param, json: { steps: cleave } }), 400);
    await expectOk(levels.$post({ param, json: { steps: cleave, force: true } }));
  });

  test("refuses hit points out of the die's bounds, a class plan in an edit, a picker without its pool or with a tier that isn't one, and an edit of no level", async () => {
    const { characterId, ctx } = await createCharacter();
    const steps = { ...fighterPlan(ctx, 1), ...payloadsOf(picks(ctx, FIGHTER_LEVELS[0])) };
    await expectStatus(levels.$post({ param: { characterId }, json: { steps: { ...steps, hp: [0] } } }), 400);
    const [created] = await expectOk(levels.$post({ param: { characterId }, json: { steps } }));
    const param = { characterId, characterLevelId: created.id };
    await expectStatus(level.$put({ param, json: { steps } }), 400);

    const options = levels.options[":step"];
    const plan = { steps: fighterPlan(ctx, 1) };
    await expectStatus(options.$post({ param: { characterId, step: "feats" }, query: {}, json: { plan } }), 400);
    const pool = ctx.aptMap["General"];
    await expectStatus(
      options.$post({ param: { characterId, step: "powers" }, query: {}, json: { plan, pool, tier: "abc" } }),
      400,
    );
    await expectStatus(levels.steps.$get({ param: { characterId }, query: { editedLevelId: NIL_UUID } }), 404);
  });

  test("opens a saved level as an edit's plan, which answers as the level saved it", async () => {
    const { characterId, ctx } = await createCharacter(16);
    const sorcerer1 = picks(ctx, SORCERER_1);
    const steps = {
      "class-plan": [{ track: ctx.klassMap.pc["Sorcerer"], position: 1 }],
      hp: [SORCERER_1.hp],
      abilities: [[]],
      ...payloadsOf(sorcerer1),
    };
    const [created] = await expectOk(levels.$post({ param: { characterId }, json: { steps } }));
    const param = { characterId, characterLevelId: created.id };
    const saved = await expectOk(level.plan.$get({ param }));
    expect(saved).toMatchObject({ editedLevelId: created.id, steps: { hp: [SORCERER_1.hp], abilities: [[]] } });
    const savedSteps = saved.steps as Record<string, { id?: string; points?: number; tier?: string }[]>;
    expect(new Set(savedSteps.skills?.map(({ id, points }) => `${id}:${points}`))).toEqual(
      new Set(steps.skills.map(({ id, points }) => `${id}:${points}`)),
    );
    // Its spells at their spell levels: a cantrip at 0
    expect(savedSteps.powers?.find(({ id }) => id === ctx.powerMap["Detect Magic"])).toMatchObject({ tier: "0" });

    // Its plan answers as the level saved it: what it picked fits, as it was
    const plan = await expectOk(levels.plan.$post({ param: { characterId }, json: saved }));
    const sorted = (byPool: Record<string, string[]>) =>
      Object.fromEntries(Object.entries(byPool).map(([pool, ids]) => [pool, [...ids].sort()]));
    expect(sorted(stepOf(plan, "feats", "pick").fitted)).toEqual(sorted(sorcerer1.feats));
    await expectStatus(level.plan.$get({ param: { characterId, characterLevelId: NIL_UUID } }), 404);
  });
});
