import { describe, expect, test } from "bun:test";

import type { InferResponseType } from "hono/client";

import { type SeedContext } from "@/database/seeders/dnd3.5/characters/seedContext.ts";
import { api, expectOk, expectStatus } from "@/tests/support/api.ts";
import { postCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { FIGHTER_LEVELS, picks, type Picks, SORCERER_1 } from "@/tests/support/dnd3.5/levelFixtures.ts";
import { savedPicksOf } from "@/tests/support/dnd3.5/levelPlans.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

/** Any route's response, read as a refusal: its status and its body. */
interface Refusal {
  clone(): { text(): Promise<string> };
  json(): Promise<unknown>;
  status: number;
}

/** A `pick` step's answer, as the API answers it. */
type PickStep = Extract<StepAnswer, { mechanic: "pick" }>;

/** A plan's answer, as the API answers it. */
type PlanAnswer = InferResponseType<(typeof levels)["plan"]["$post"], 200>;

/** A `spend` step's answer, as the API answers it. */
type SpendStep = Extract<StepAnswer, { mechanic: "spend" }>;

/** A step's answer, any mechanic's. */
type StepAnswer = PlanAnswer["steps"][string];

/** A page of a step's options, as the API answers it: of any kind, its rows groups or not. */
type StepOptions = InferResponseType<(typeof levels)["options"][":step"]["$post"], 200>;

/** Each spell level a spell pool's next pick lands at, and any (`""`): all on the plan's level `index`. */
const ALL_TIERS = ["", ..."0123456789"];

/** A sorcerer's and a wizard's cantrips, by name: the spells at a sorcerer's tier 0. */
const CANTRIPS = [
  "Acid Splash",
  "Arcane Mark",
  "Dancing Lights",
  "Daze",
  "Detect Magic",
  "Detect Poison",
  "Disrupt Undead",
  "Flare",
  "Ghost Sound",
  "Light",
  "Mage Hand",
  "Mending",
  "Message",
  "Open/close",
  "Prestidigitation",
  "Ray of Frost",
  "Read Magic",
  "Resistance",
  "Touch of Fatigue",
];

/** A fighter's class skills, as the skills step favors them. */
const FIGHTER_SKILLS = ["Climb", "Craft", "Handle Animal", "Intimidate", "Jump", "Ride", "Swim"];

const levels = api.api.characters.levels[":characterId"];
const level = levels[":advancementId"];

/** A sorcerer's grants at its first level, by name: its class features, none free of a pool's room. */
const SORCERER_GRANTS = ["Spells (Sorcerer)", "Summon Familiar (Sorcerer)", "Weapon and Armor Proficiency (Sorcerer)"];

/** A sorcerer's class skills, as the skills step favors them. */
const SORCERER_SKILLS = ["Bluff", "Concentration", "Craft", "Knowledge (Arcana)", "Profession", "Spellcraft"];

/**
 * A `pick` step's pools, as expected: those `room` names, each with its room, and every other the step lists empty
 * (`empty` says what else an empty one carries: a spell pool's tiers, none).
 */
function expectedPools(step: PickStep, room: Record<string, Partial<PickStep["pools"][string]>>, empty = {}) {
  expect(Object.values(step.pools).map(({ name }) => name)).toEqual(expect.arrayContaining(Object.keys(room)));
  return Object.fromEntries(
    Object.values(step.pools).map(({ id, name }) => [
      id,
      { allowed: 0, available: 0, id, name, optional: false, spent: 0, ...empty, ...room[name] },
    ]),
  );
}

/**
 * A `spend` step's rows, each by its own numbers: its value moving by its step (a rank for a favored row's point, half
 * one otherwise), the value its points buy, and the value at each number of points up to the most it keeps of what the
 * budget has left.
 */
function expectRowsConsistent({ budget, rows }: SpendStep, favored: string[]) {
  const spent = rows.reduce((sum, { points }) => sum + points, 0);
  expect(rows.filter((row) => row.favored).map(({ name }) => name)).toEqual(favored);
  for (const row of rows) {
    expect(row.step).toBe(row.favored ? 1 : 0.5);
    const most = Math.min(row.maxPoints, budget - spent + row.points);
    expect(row.valuesByPoints).toEqual(Array.from({ length: most + 1 }, (_, points) => points * row.step));
    expect(row.value).toBe(row.valuesByPoints[row.points]);
  }
}

/** A plan's fighter levels (`count`), from the first, with their hit points and no ability increase. */
function fighterPlan(ctx: SeedContext, count: number) {
  const plans = FIGHTER_LEVELS.slice(0, count);
  return {
    "class-plan": plans.map((_, i) => ({ track: ctx.classMap.pc["Fighter"], position: i + 1 })),
    hp: plans.map((plan) => plan.hp),
    abilities: plans.map(() => []),
  };
}

/** The keys a page's rows hold, each once, by name. */
function keysOf(rows: object[]) {
  return [...new Set(rows.flatMap((row) => Object.keys(row)))].sort();
}

/** Each pool's next pick of a `pick` step, at any tier and each of `tiers`, on the plan's level `index`. */
function nextAt(step: PickStep, index: number, tiers: (id: string) => string[] = () => [""]) {
  return Object.fromEntries(
    Object.keys(step.pools).map((id) => [id, Object.fromEntries(tiers(id).map((tier) => [tier, index]))]),
  );
}

/** A page of options, its rows groups (`grouped`) or not: refused when they're the other's. */
function optionsOf<G extends boolean>(options: StepOptions, grouped: G) {
  if (options.grouped !== grouped) throw new Error(`The options are grouped: ${options.grouped}, not ${grouped}`);
  return options as Extract<StepOptions, { grouped: G }>;
}

/** A level's picks as a plan's payloads: its skills' points, and its feats and spells, each in its pool. */
function payloadsOf({ feats, spells, skills }: Picks) {
  const picked = (byPool: Record<string, string[]>) =>
    Object.entries(byPool).flatMap(([pool, ids]) => ids.map((id) => ({ id, pool })));
  return {
    skills: Object.entries(skills).map(([id, points]) => ({ id, points })),
    feats: picked(feats),
    spells: picked(spells),
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

/** A `spend` step's rows with ranks or points, by name: what's spent on each, and the most it can take. */
function spentRows({ rows }: SpendStep) {
  return rows
    .filter(({ current, points }) => current > 0 || points > 0)
    .map(({ current, maxPoints, name, points, value }) => ({ name, current, points, value, maxPoints }));
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

/** A saved level, its plan read back by kind, with the class level its plan takes. */
async function readLevel(characterId: string, advancementId: string) {
  const plan = await expectOk(level.plan.$get({ param: { characterId, advancementId } }));
  const {
    advancements: [advancement],
  } = await expectOk(levels.plan.$post({ param: { characterId }, json: plan }));
  return { ...savedPicksOf(plan), classId: advancement.track.id, level: advancement.position };
}

describe("character level plans", () => {
  test("lists a level's steps by their mechanics, an edit's without its class plan", async () => {
    const { characterId, ctx } = await createCharacter();
    const { advancements, steps } = await expectOk(levels.steps.$get({ param: { characterId }, query: {} }));
    // Each in its words: what the wizard shows past its label and its kinds' words, and its advancements'
    expect(advancements).toEqual({ position: { many: "Levels", one: "Level" }, review: "Class Advancement" });
    expect(steps.find(({ name }) => name === "hp")?.words).toEqual({
      entry: "Enter HP gain",
      prompt: "Set HP for",
      unit: "HP Gain",
    });
    expect(steps.find(({ name }) => name === "skills")?.words).toMatchObject({
      budget: "Skill Points to Spend",
      currency: { many: "points", one: "point" },
    });
    expect(steps.find(({ name }) => name === "feats")?.words).toMatchObject({
      group: { many: "variants", one: "variant" },
      optional: "optional",
    });
    expect(steps.find(({ name }) => name === "spells")?.words).toMatchObject({
      grantNote: "class ability",
      tiers: { "0": "Cantrips", "1": "Level 1" },
    });
    expect(steps.map(({ mechanic, name }) => [name, mechanic])).toEqual([
      ["class-plan", "plan"],
      ["hp", "value"],
      ["abilities", "choose"],
      ["skills", "spend"],
      ["feats", "pick"],
      ["spells", "pick"],
    ]);

    const [created] = await expectOk(
      levels.$post({
        param: { characterId },
        json: { steps: { ...fighterPlan(ctx, 1), ...payloadsOf(picks(ctx, FIGHTER_LEVELS[0])) } },
      }),
    );
    const edited = await expectOk(levels.steps.$get({ param: { characterId }, query: { editedLevelId: created.id } }));
    expect(edited.steps.map(({ name }) => name)).toEqual(["hp", "abilities", "skills", "feats", "spells"]);
    // Its advancement's words, though it has no class plan
    expect(edited.advancements).toEqual(advancements);
  });

  test("answers a level-up's plan, each step by its mechanic: a human fighter 1–2's", async () => {
    const { characterId, ctx } = await createCharacter();
    const fighter = ctx.classMap.pc["Fighter"];
    const general = ctx.aptMap["General"];
    const bonus = ctx.aptMap["Fighter Bonus Feat"];
    const powerAttack = ctx.featMap["Power Attack"];
    const plan = await expectOk(
      levels.plan.$post({
        param: { characterId },
        json: { steps: { ...fighterPlan(ctx, 2), feats: [{ id: powerAttack, pool: general }] } },
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
    // Every skill, none ranked yet: 5 points the most either kind keeps, a class skill's 5 ranks (2 + 3), another's 2.5
    expect(skills.rows.map(({ id }) => id).sort()).toEqual(Object.values(ctx.skillMap).sort());
    expect(spentRows(skills)).toEqual([]);
    expect(new Set(skills.rows.map(({ maxPoints }) => maxPoints))).toEqual(new Set([5]));
    expectRowsConsistent(skills, FIGHTER_SKILLS);
    // 2 General feats and 2 Fighter Bonus Feats, Power Attack taking one, on the first level; the fighter's class
    // features filled by its grants
    const feats = stepOf(plan, "feats", "pick");
    expect(feats).toMatchObject({ fitted: { [general]: [powerAttack] }, grouped: true });
    expect(feats.pools).toEqual(
      expectedPools(feats, {
        "Fighter Bonus Feat": { allowed: 2, available: 2 },
        "Fighter Class Feature": { allowed: 3, spent: 3 },
        General: { allowed: 2, available: 2 },
      }),
    );
    // The pools with room take their next pick on the first level; the others, on the plan's last
    expect(feats.next).toEqual({ ...nextAt(feats, 1), [general]: { "": 0 }, [bonus]: { "": 0 } });
    expect(stepOf(plan, "spells", "pick")).toMatchObject({ grouped: false, pools: {} });
  });

  test("answers an edit's level in the level's place", async () => {
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

    expect(plan.advancements).toEqual([
      { id: expect.any(String), position: 1, track: { id: ctx.classMap.pc["Fighter"], name: "Fighter" } },
    ]);
    expect(plan.steps["class-plan"]).toBeUndefined();
    expect(stepOf(plan, "hp", "value").advancements).toEqual([{ average: 5, max: 10, min: 1, roll: "d10" }]);
    // A human fighter 1, INT 12: (2 + 1 + 1) x 4 skill points
    expect(stepOf(plan, "skills", "spend")).toMatchObject({ budget: 16, perAdvancement: [16] });
    // The level's own feats stay picked, its pools' room theirs
    const feats = stepOf(plan, "feats", "pick");
    expect(feats.fitted).toEqual(fighter1.feats);
    expect(feats.pools[ctx.aptMap["General"]]).toMatchObject({ allowed: 2, available: 2, spent: 0 });
  });

  test("opens each step's picker over the plan: its classes, a pool's feats grouped and a family's, and spells by tier", async () => {
    const { characterId, ctx } = await createCharacter();
    const fighter = ctx.classMap.pc["Fighter"];
    const general = ctx.aptMap["General"];
    const options = levels.options[":step"];
    const empty = { steps: {} };

    const classes = await expectOk(
      options.$post({ param: { characterId, step: "class-plan" }, query: {}, json: { plan: empty } }),
    );
    expect(optionsOf(classes, false).items.find((klass) => klass.id === fighter)).toMatchObject({
      track: { next: 1 },
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
    expect(optionsOf(cleave, true).items.find((row) => row.name === "Cleave")).toMatchObject({
      eligible: true,
    });

    // A family's members, one row each: as many as its row counts, its row's own among them
    const json = { plan: { steps: fighterPlan(ctx, 1) }, pool: general };
    const focus = await expectOk(
      options.$post({ param: { characterId, step: "feats" }, query: { search: "Weapon Focus" }, json }),
    );
    const family = optionsOf(focus, true).items.find((row) => row.group !== null);
    if (!family?.group) throw new Error("No feat family found");
    const members = await expectOk(
      options.$post({
        param: { characterId, step: "feats" },
        query: { limit: "100" },
        json: { ...json, group: family.group },
      }),
    );
    const memberIds = optionsOf(members, false).items.map(({ id }) => id);
    expect(family.count).toBeGreaterThan(1);
    expect(memberIds).toHaveLength(family.count);
    expect(new Set(memberIds).size).toBe(family.count);
    expect(memberIds).toContain(family.id);
    // A group that names no family opens none: the pool's groups
    const unnamed = await expectOk(
      options.$post({
        param: { characterId, step: "feats" },
        query: { search: "Weapon Focus" },
        json: { ...json, group: "" },
      }),
    );
    expect(unnamed).toEqual(focus);
    // Each row a step's option or group alone: nothing else of the row its picker read (a class's fields, a feat's pools)
    const optionKeys = ["description", "eligible", "id", "name", "requirementTree"];
    expect([...optionKeys, "track"]).toEqual(expect.arrayContaining(keysOf(classes.items)));
    expect([...optionKeys, "count", "group"]).toEqual(expect.arrayContaining(keysOf(focus.items)));
    expect(optionKeys).toEqual(expect.arrayContaining(keysOf(members.items)));

    // A sorcerer's cantrips, at tier 0
    const sorcerer = await createCharacter(16);
    const sorcererSpells = sorcerer.ctx.aptMap["Sorcerer Spells"];
    const sorcererPlan = { steps: { "class-plan": [{ track: sorcerer.ctx.classMap.pc["Sorcerer"], position: 1 }] } };
    const cantrips = await expectOk(
      options.$post({
        param: { characterId: sorcerer.characterId, step: "spells" },
        query: { limit: "50" },
        json: { plan: sorcererPlan, pool: sorcererSpells, tier: "0" },
      }),
    );
    const cantripIds = optionsOf(cantrips, false).items.map(({ id }) => id);
    expect(optionsOf(cantrips, false).items.map(({ name }) => name)).toEqual(CANTRIPS);
    expect(cantripIds).toEqual(CANTRIPS.map((name) => sorcerer.ctx.spellMap[name]));
    expect(optionKeys).toEqual(expect.arrayContaining(keysOf(cantrips.items)));
    // Its first-level spells, at tier 1: no cantrip among them
    const firsts = await expectOk(
      options.$post({
        param: { characterId: sorcerer.characterId, step: "spells" },
        query: { limit: "100" },
        json: { plan: sorcererPlan, pool: sorcererSpells, tier: "1" },
      }),
    );
    const firstNames = optionsOf(firsts, false).items.map(({ name }) => name);
    expect(firstNames).toEqual(expect.arrayContaining(["Magic Missile", "Shield", "Mage Armor"]));
    expect(firstNames.filter((name) => CANTRIPS.includes(name))).toEqual([]);
    // A plan's spells picked so far stay out
    const withPicked = {
      steps: {
        ...sorcererPlan.steps,
        spells: [{ id: sorcerer.ctx.spellMap["Detect Magic"], pool: sorcererSpells, tier: "0" }],
      },
    };
    const rest = await expectOk(
      options.$post({
        param: { characterId: sorcerer.characterId, step: "spells" },
        query: { limit: "50" },
        json: { plan: withPicked, pool: sorcererSpells, tier: "0" },
      }),
    );
    expect(optionsOf(rest, false).items.map(({ id }) => id)).not.toContain(sorcerer.ctx.spellMap["Detect Magic"]);
  });

  test("saves a level-up's plan as the levels it writes, and an edit's as the level's", async () => {
    const { characterId, ctx } = await createCharacter();
    const fighter1 = picks(ctx, FIGHTER_LEVELS[0]);
    const [created] = await expectOk(
      levels.$post({ param: { characterId }, json: { steps: { ...fighterPlan(ctx, 1), ...payloadsOf(fighter1) } } }),
    );
    const param = { characterId, advancementId: created.id };
    expect(await readLevel(characterId, created.id)).toMatchObject({
      hp: FIGHTER_LEVELS[0].hp,
      classId: ctx.classMap.pc["Fighter"],
      level: 1,
      skills: fighter1.skills,
    });

    const edit = {
      hp: [5],
      abilities: [[]],
      spells: [],
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
    const saved = await readLevel(characterId, created.id);
    expect(saved).toMatchObject({ hp: 5, classId: ctx.classMap.pc["Fighter"], level: 1, abilityIncreases: [] });
    expect(saved.skills).toEqual(Object.fromEntries(edit.skills.map(({ id, points }) => [id, points])));
    expect([...(saved.feats[ctx.aptMap["General"]] ?? [])].sort()).toEqual(
      [ctx.featMap["Power Attack"], ctx.featMap["Toughness"]].sort(),
    );
    expect(saved.feats[ctx.aptMap["Fighter Bonus Feat"]]).toEqual([ctx.featMap["Combat Reflexes"]]);
  });

  test("saves a sorcerer's spells picked by tier, each in its pool", async () => {
    const { characterId, ctx } = await createCharacter(16);
    const sorcerer1 = picks(ctx, SORCERER_1);
    const steps = {
      "class-plan": [{ track: ctx.classMap.pc["Sorcerer"], position: 1 }],
      hp: [SORCERER_1.hp],
      abilities: [[]],
      ...payloadsOf(sorcerer1),
    };
    const [created] = await expectOk(levels.$post({ param: { characterId }, json: { steps } }));
    const saved = await readLevel(characterId, created.id);
    expect([...(saved.spells[ctx.aptMap["Sorcerer Spells"]] ?? [])].sort()).toEqual(
      [...(sorcerer1.spells[ctx.aptMap["Sorcerer Spells"]] ?? [])].sort(),
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

  test("answers every step of a level-up's plan: a fourth level's increase, a sorcerer's tiers", async () => {
    const { characterId, ctx } = await createCharacter();
    const fighter = ctx.classMap.pc["Fighter"];
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
    // The six abilities, in a sheet's order, Strength 16 raised to 17 by the level's increase
    const scores: [string, string, number, number][] = [
      ["Strength", "STR", 17, 3],
      ["Dexterity", "DEX", 14, 2],
      ["Constitution", "CON", 14, 2],
      ["Intelligence", "INT", 12, 1],
      ["Wisdom", "WIS", 10, 0],
      ["Charisma", "CHA", 8, -1],
    ];
    expect(stepOf(fourth, "abilities", "choose")).toEqual({
      mechanic: "choose",
      advancements: [0],
      amount: 1,
      chosen: true,
      options: scores.map(([name, abbreviation, score, modifier]) => ({
        abbreviation,
        id: ctx.abilityMap[name],
        modifier,
        name,
        score,
      })),
    });
    // A human fighter 4, INT 12: 4 points, over the ranks fighter 1–3 bought; a class skill's capped at 7 (4 + 3), a
    // cross-class one's at 3.5
    const skills = stepOf(fourth, "skills", "spend");
    expect(skills).toEqual({ mechanic: "spend", budget: 4, perAdvancement: [4], rows: expect.any(Array) });
    expect(skills.rows.map(({ id }) => id).sort()).toEqual(Object.values(ctx.skillMap).sort());
    expect(spentRows(skills)).toEqual([
      { name: "Climb", current: 5, points: 1, value: 1, maxPoints: 2 },
      { name: "Handle Animal", current: 2, points: 0, value: 0, maxPoints: 4 },
      { name: "Intimidate", current: 5, points: 0, value: 0, maxPoints: 2 },
      { name: "Jump", current: 5, points: 0, value: 0, maxPoints: 2 },
      { name: "Spot", current: 0.5, points: 0, value: 0, maxPoints: 4 },
      { name: "Swim", current: 6, points: 0, value: 0, maxPoints: 1 },
    ]);
    expectRowsConsistent(skills, FIGHTER_SKILLS);

    // A sorcerer's first level, two cantrips picked: its pools by spell level, its grants, where each pick lands
    const sorcerer = await createCharacter(16);
    const sorcererClass = sorcerer.ctx.classMap.pc["Sorcerer"];
    const sorcererSpells = sorcerer.ctx.aptMap["Sorcerer Spells"];
    const cantrips = ["Detect Magic", "Light"].map((name) => sorcerer.ctx.spellMap[name]);
    const plan = await expectOk(
      levels.plan.$post({
        param: { characterId: sorcerer.characterId },
        json: {
          steps: {
            "class-plan": [{ track: sorcererClass, position: 1 }],
            spells: cantrips.map((id) => ({ id, pool: sorcererSpells, tier: "0" })),
          },
        },
      }),
    );
    // A sorcerer 1 knows 4 cantrips and 2 first-level spells: its pool's room, before the plan's picks
    const spells = stepOf(plan, "spells", "pick");
    const fitted = { [sorcererSpells]: cantrips };
    expect(spells).toEqual({
      mechanic: "pick",
      fitted,
      picked: pickedOf(fitted),
      granted: [],
      grouped: false,
      next: nextAt(spells, 0, () => ALL_TIERS),
      pools: expectedPools(
        spells,
        {
          "Sorcerer Spells": {
            available: 6,
            tiers: { "0": { allowed: 4, available: 4, spent: 0 }, "1": { allowed: 2, available: 2, spent: 0 } },
          },
        },
        { tiers: {} },
      ),
    });
    // The cantrips picked, by name, at their tier
    expect(spells.picked[sorcererSpells]).toEqual([
      expect.objectContaining({ id: cantrips[0], name: "Detect Magic", tier: "0" }),
      expect.objectContaining({ id: cantrips[1], name: "Light", tier: "0" }),
    ]);
    // A human sorcerer 1's 2 General feats and its familiar; its class features filled by its grants
    const feats = stepOf(plan, "feats", "pick");
    expect(feats).toEqual({
      mechanic: "pick",
      fitted: {},
      picked: {},
      granted: SORCERER_GRANTS.map((name) => ({
        description: expect.any(String),
        free: false,
        id: sorcerer.ctx.featMap[name],
        name,
      })),
      grouped: true,
      next: nextAt(feats, 0),
      pools: expectedPools(feats, {
        "Familiar Bond": { allowed: 1, available: 1 },
        General: { allowed: 2, available: 2 },
        "Sorcerer Class Feature": { allowed: 3, spent: 3 },
      }),
    });
  });

  test("answers every step of an edit's level, each pool's next pick on the level", async () => {
    const { characterId, ctx } = await createCharacter(16);
    const sorcerer1 = picks(ctx, SORCERER_1);
    const sorcererClass = ctx.classMap.pc["Sorcerer"];
    const sorcererSpells = ctx.aptMap["Sorcerer Spells"];
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

    const feats = stepOf(plan, "feats", "pick");
    const spells = stepOf(plan, "spells", "pick");
    // The level's own picks free in its pools: their room the level's, as if none were picked
    expect(plan.steps).toEqual({
      hp: { mechanic: "value", advancements: [{ average: 2, max: 4, min: 1, roll: "d4" }] },
      // A first level takes no increase
      abilities: { mechanic: "choose", advancements: [], amount: 1, chosen: true, options: [] },
      // A human sorcerer 1, INT 12: (2 + 1 + 1) x 4 skill points
      skills: { mechanic: "spend", budget: 16, perAdvancement: [16], rows: expect.any(Array) },
      feats: {
        mechanic: "pick",
        fitted: sorcerer1.feats,
        picked: pickedOf(sorcerer1.feats),
        granted: SORCERER_GRANTS.map((name) => ({
          description: expect.any(String),
          free: false,
          id: ctx.featMap[name],
          name,
        })),
        grouped: true,
        next: nextAt(feats, 0),
        pools: expectedPools(feats, {
          "Familiar Bond": { allowed: 1, available: 1 },
          General: { allowed: 2, available: 2 },
          "Sorcerer Class Feature": { allowed: 3, spent: 3 },
        }),
      },
      spells: {
        mechanic: "pick",
        fitted: sorcerer1.spells,
        picked: pickedOf(sorcerer1.spells),
        granted: [],
        grouped: false,
        // At any tier, and at each its pool has: a sorcerer 1's cantrips and first-level spells
        next: nextAt(spells, 0, (id) => (id === sorcererSpells ? ["", "0", "1"] : [""])),
        pools: expectedPools(
          spells,
          {
            "Sorcerer Spells": {
              available: 6,
              tiers: { "0": { allowed: 4, available: 4, spent: 0 }, "1": { allowed: 2, available: 2, spent: 0 } },
            },
          },
          { tiers: {} },
        ),
      },
    });
    // Its skills' points, each where the level spent it: a class skill's rank a point, a cross-class one's half; a
    // first level's capped at 4 ranks, or 2
    const skills = stepOf(plan, "skills", "spend");
    expect(skills.rows.map(({ id }) => id).sort()).toEqual(Object.values(ctx.skillMap).sort());
    expect(spentRows(skills)).toEqual([
      { name: "Bluff", current: 0, points: 4, value: 4, maxPoints: 4 },
      { name: "Concentration", current: 0, points: 4, value: 4, maxPoints: 4 },
      { name: "Spellcraft", current: 0, points: 4, value: 4, maxPoints: 4 },
      { name: "Use Magic Device", current: 0, points: 4, value: 2, maxPoints: 4 },
    ]);
    expectRowsConsistent(skills, SORCERER_SKILLS);
  });

  test("opens a pool's picker at the level its pick lands on, the plan's levels before and after it, and an edit's at its level", async () => {
    const { characterId, ctx } = await createCharacter();
    const general = ctx.aptMap["General"];
    const options = levels.options[":step"];
    const fighterRanger = {
      ...fighterPlan(ctx, 1),
      "class-plan": [
        { track: ctx.classMap.pc["Fighter"], position: 1 },
        { track: ctx.classMap.pc["Ranger"], position: 1 },
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
      return optionsOf(answer, true).items.map(({ name }) => name);
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
    expect(optionsOf(classes, false).items.find(({ id }) => id === ctx.classMap.pc["Fighter"])).toMatchObject({
      eligible: true,
      track: { next: 1 },
    });

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
      return optionsOf(answer, true).items.find(({ name }) => name === "Cleave")?.eligible;
    };
    expect(await cleave(payloadsOf(fighter1).feats)).toBe(true);
    expect(await cleave([])).toBe(false);
  });

  test("leaves out of a pool's picker a feat the plan picked that doesn't stack, and keeps one that stacks", async () => {
    const { characterId, ctx } = await createCharacter();
    const general = ctx.aptMap["General"];
    const picked = [ctx.featMap["Power Attack"], ctx.featMap["Toughness"]].map((id) => ({ id, pool: general }));
    const offered = async (search: string, feats: typeof picked) => {
      const answer = await expectOk(
        levels.options[":step"].$post({
          param: { characterId, step: "feats" },
          query: { search },
          json: { plan: { steps: { ...fighterPlan(ctx, 1), feats } }, pool: general },
        }),
      );
      return optionsOf(answer, true).items.map(({ name }) => name);
    };
    expect(await offered("Power Attack", [])).toContain("Power Attack");
    expect(await offered("Power Attack", picked)).not.toContain("Power Attack");
    expect(await offered("Toughness", picked)).toContain("Toughness");
  });

  test("saves a level's increase, refuses an unanswered step, and an unmet requirement unless forced", async () => {
    const { characterId, ctx } = await createCharacter();
    const fighter = ctx.classMap.pc["Fighter"];
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
    const { spells: _, ...unanswered } = fourth;
    await expectStatus(levels.$post({ param: { characterId }, json: { steps: unanswered } }), 400);
    const [created] = await expectOk(levels.$post({ param: { characterId }, json: { steps: fourth } }));
    expect(await readLevel(characterId, created.id)).toMatchObject({
      abilityIncreases: [{ entityId: ctx.abilityMap["Strength"], amount: 1 }],
      classId: fighter,
      level: 4,
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
    const param = { characterId, advancementId: created.id };
    await expectStatus(level.$put({ param, json: { steps } }), 400);

    const options = levels.options[":step"];
    const plan = { steps: fighterPlan(ctx, 1) };
    await expectStatus(options.$post({ param: { characterId, step: "feats" }, query: {}, json: { plan } }), 400);
    const pool = ctx.aptMap["General"];
    await expectStatus(
      options.$post({ param: { characterId, step: "spells" }, query: {}, json: { plan, pool, tier: "abc" } }),
      400,
    );
    await expectStatus(levels.steps.$get({ param: { characterId }, query: { editedLevelId: NIL_UUID } }), 404);
  });

  test("refuses a level the character hasn't alike in every flow that names one, after the request's other refusals", async () => {
    const { characterId, ctx } = await createCharacter();
    const { "class-plan": classPlan, ...edit } = {
      ...fighterPlan(ctx, 1),
      ...payloadsOf(picks(ctx, FIGHTER_LEVELS[0])),
    };
    await expectOk(levels.$post({ param: { characterId }, json: { steps: { "class-plan": classPlan, ...edit } } }));
    const options = levels.options[":step"];
    const unknown = { characterId, advancementId: NIL_UUID };
    const plan = { editedLevelId: NIL_UUID, steps: {} };
    const pool = ctx.aptMap["General"];
    const refused: (() => Promise<Refusal>)[] = [
      () => levels.steps.$get({ param: { characterId }, query: { editedLevelId: NIL_UUID } }),
      () => level.plan.$get({ param: unknown }),
      () => levels.plan.$post({ param: { characterId }, json: plan }),
      () => options.$post({ param: { characterId, step: "feats" }, query: {}, json: { plan, pool } }),
      () => level.$put({ param: unknown, json: { steps: edit } }),
    ];
    // One at a time: the test's transaction has a single connection
    for (const call of refused)
      expect(await (await expectStatus(call(), 404)).json()).toMatchObject({ message: "Character level not found" });

    // A step an edit hasn't, an unanswered step and a pool the ruleset hasn't are refused first
    const invalid: (() => Promise<Refusal>)[] = [
      () => levels.plan.$post({ param: { characterId }, json: { ...plan, steps: { "class-plan": classPlan } } }),
      () => level.$put({ param: unknown, json: { steps: {} } }),
      () => options.$post({ param: { characterId, step: "feats" }, query: {}, json: { plan, pool: NIL_UUID } }),
    ];
    for (const call of invalid) await expectStatus(call(), 400);
  });

  test("opens a saved level as an edit's plan, which answers as the level saved it", async () => {
    const { characterId, ctx } = await createCharacter(16);
    const sorcerer1 = picks(ctx, SORCERER_1);
    const steps = {
      "class-plan": [{ track: ctx.classMap.pc["Sorcerer"], position: 1 }],
      hp: [SORCERER_1.hp],
      abilities: [[]],
      ...payloadsOf(sorcerer1),
    };
    const [created] = await expectOk(levels.$post({ param: { characterId }, json: { steps } }));
    const param = { characterId, advancementId: created.id };
    const saved = await expectOk(level.plan.$get({ param }));
    expect(saved).toMatchObject({ editedLevelId: created.id, steps: { hp: [SORCERER_1.hp], abilities: [[]] } });
    const savedSteps = saved.steps as Record<string, { id?: string; points?: number; tier?: string }[]>;
    expect(new Set(savedSteps.skills?.map(({ id, points }) => `${id}:${points}`))).toEqual(
      new Set(steps.skills.map(({ id, points }) => `${id}:${points}`)),
    );
    // Its spells at their spell levels: a cantrip at 0
    expect(savedSteps.spells?.find(({ id }) => id === ctx.spellMap["Detect Magic"])).toMatchObject({ tier: "0" });

    // Its plan answers as the level saved it: what it picked fits, as it was
    const plan = await expectOk(levels.plan.$post({ param: { characterId }, json: saved }));
    const sorted = (byPool: Record<string, string[]>) =>
      Object.fromEntries(Object.entries(byPool).map(([pool, ids]) => [pool, [...ids].sort()]));
    expect(sorted(stepOf(plan, "feats", "pick").fitted)).toEqual(sorted(sorcerer1.feats));
    expect(sorted(stepOf(plan, "spells", "pick").fitted)).toEqual(sorted(sorcerer1.spells));

    // Saved back as it was, the level is the same
    const before = await readLevel(characterId, created.id);
    await expectOk(level.$put({ param, json: { steps: saved.steps } }));
    expect(await readLevel(characterId, created.id)).toEqual(before);
    expect(await expectOk(level.plan.$get({ param }))).toEqual(saved);
    await expectStatus(level.plan.$get({ param: { characterId, advancementId: NIL_UUID } }), 404);
  });
});
