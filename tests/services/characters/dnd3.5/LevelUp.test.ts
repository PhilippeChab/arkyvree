import { describe, expect, test } from "bun:test";

import { type SeedContext } from "@/database/seeders/dnd3.5/characters/seedContext.ts";
import type { LevelPlanAnswer } from "@/engine/core/module/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Characters, Modifiers, Picks } from "@/server/repositories/index.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { sheetOf } from "@/tests/support/dnd3.5/characters.ts";
import {
  addFighterLevels,
  type BUILDS,
  createSeedCharacter,
  FIGHTER_LEVELS,
  type LevelPlan,
  levelUp,
  picks,
  SORCERER_1,
  WAR_CLERIC_1,
  WIZARD_1,
} from "@/tests/support/dnd3.5/levelFixtures.ts";
import {
  levelEditPlan,
  levelUpPlan,
  type PlannedClassLevel,
  type PlanPicks,
  savedPicksOf,
} from "@/tests/support/dnd3.5/levelPlans.ts";
import { addCharacterLevel, findClassLevel, findPicks, increasesOf } from "@/tests/support/dnd3.5/levels.ts";
import { addLists } from "@/tests/support/dnd3.5/links.ts";
import { getPlanAnswer, getStepOptions, stepAnswerOf } from "@/tests/support/levels.ts";
import { copyEntity, createSeededTestRuleset, invalidateSeededRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

/** A level of a batch: class, level, hit points and the ability it increases. */
type BatchLevel = [klass: string, level: number, hp: number, ability?: string];

const session = makeSession();

/** A human cleric's first level: the War and Good domains, the longsword as war weapon, and two General feats. */
const WAR_CLERIC_FIRST = {
  hp: 8,
  skills: { Concentration: 4, Diplomacy: 4, Heal: 4, Spellcraft: 4 },
  feats: {
    "Cleric Domain": ["War Domain", "Good Domain"],
    "War Domain Weapon": ["War Domain Weapon: Longsword"],
    General: ["Toughness", "Great Fortitude"],
  },
};

/** The refusal of a pick of a feat that doesn't stack, which the character has already. */
function alreadyHeld(feat: string) {
  return { message: `Non-stackable feat "${feat}" is already on this character`, refusal: "invalid" };
}

function fighter(count: number) {
  return Array.from({ length: count }, (_, i): [string, number] => ["Fighter", i + 1]);
}

/** Fighter levels 1 to `count`, as a batch. */
function fighterLevels(count: number): BatchLevel[] {
  return FIGHTER_LEVELS.slice(0, count).map((plan, index) => ["Fighter", index + 1, plan.hp, plan.ability]);
}

/** Finalizes several levels at once, the picks pooled across them. */
function finalizeBatch(
  ctx: SeedContext,
  characterId: string,
  levels: BatchLevel[],
  plan: Omit<LevelPlan, "hp">,
  force = false,
) {
  const batch = levels.map(([klass, level, hp, ability]) => ({
    classId: ctx.classMap.pc[klass],
    level,
    hp,
    abilityIncreases: increasesOf(ability && ctx.abilityMap[ability]),
  }));
  return CharacterLevelsService.addLevels(session, characterId, levelUpPlan(batch, picks(ctx, plan)), force);
}

function levelsOf(klass: string, hps: number[]): BatchLevel[] {
  return hps.map((hp, index) => [klass, index + 1, hp]);
}

/** The refusal of a plan past a character's last level, with the levels it has left. */
function pastLastLevel(levelsLeft: number) {
  const message = `A character can't go past level 20: ${levelsLeft} level(s) left`;
  return { refusal: "invalid", issues: [{ category: "levels", message }] };
}

/** The feats step of a plan's answer, and its spells step. */
function pickSteps(answer: LevelPlanAnswer) {
  return { feats: stepAnswerOf(answer, "feats", "pick"), spells: stepAnswerOf(answer, "spells", "pick") };
}

/**
 * A human cleric's first level (`WAR_CLERIC_FIRST`) with these General feats, its pools in the order a form would send
 * them picked: its General feats first, or its war weapon.
 */
function warClericFirst(general: string[], first: "General" | "War Domain Weapon" = "General"): LevelPlan {
  const { General: _general, ...others } = WAR_CLERIC_FIRST.feats;
  const feats = first === "General" ? { General: general, ...others } : { ...others, General: general };
  return { ...WAR_CLERIC_FIRST, feats };
}

/** A new seeded fighter with fighter levels 1 to `count`, written straight to the database. */
async function createFighterAt(ctx: SeedContext, count: number) {
  const characterId = await createSeedCharacter(ctx);
  for (let level = 1; level <= count; level++)
    await addCharacterLevel(characterId, (await findClassLevel(ctx.classMap.pc["Fighter"], level))!.id);
  return characterId;
}

/**
 * A fork whose Detect Magic makes Light known on the sorcerer's list (`rulesetId`), and a human sorcerer of it
 * (`characterId`): the seed's context with the fork's Detect Magic, its copy, which the pickers list (`ctx`).
 */
async function createLightGivingSorcerer() {
  const ctx = await getSeedCtx();
  const fork = await createSeededTestRuleset(SEED_USER_ID);
  const detectMagic = await copyEntity(db, "spells", ctx.spellMap["Detect Magic"], fork);
  await give("spells", detectMagic.id, "spells.light.sorcerer.known");
  RulesetViews.invalidate(fork.id);
  const characterId = await createSeedCharacter(ctx, "sorcerer", { rulesetId: fork.id, xp: 1000 });
  const forkCtx: SeedContext = { ...ctx, spellMap: { ...ctx.spellMap, "Detect Magic": detectMagic.id } };
  return { characterId, ctx: forkCtx, rulesetId: fork.id };
}

/**
 * Edit Level's answer of the character's saved level `levelId`, with these picks (by pool): its steps at the level.
 */
async function editAnswer(characterId: string, levelId: string, picked: PlanPicks) {
  return await getPlanAnswer(session, characterId, { ...levelEditPlan({ hp: 1 }, picked), editedLevelId: levelId });
}

/**
 * Whether a feat is eligible at `level` of a batch of fighter levels, as Add Level's picker asks: after the levels
 * planned before it, with these picks and ability increases (one per level, the picked level's last).
 */
async function eligible(
  search: string,
  level: number,
  options: { increases?: (string | undefined)[]; pendingPicks?: string[]; strength?: number } = {},
) {
  const ctx = await getSeedCtx();
  const characterId = await createSeedCharacter(ctx, "fighter", {
    xp: 6000,
    abilities: { Strength: options.strength ?? 14 },
  });
  const general = ctx.aptMap["General"];
  const plan = levelUpPlan(
    Array.from({ length: level }, (_, i) => ({
      abilityIncreases: increasesOf(options.increases?.[i]),
      hp: 10,
      classId: ctx.classMap.pc["Fighter"],
      level: i + 1,
    })),
    { feats: { [general]: (options.pendingPicks ?? []).map((name) => ctx.featMap[name]) } },
  );
  // The pick lands on the plan's last level, `level`
  const { items } = await getStepOptions(
    session,
    characterId,
    "feats",
    plan,
    { advancement: level - 1, pool: general },
    { limit: 20, search },
  );
  return items.find((row) => row.name === search)!.eligible;
}

/** Gives a row (`sourceType`'s `sourceId`) a modifier that gives what `target` names, a feat or a spell on a list. */
async function give(sourceType: string, sourceId: string, target: string) {
  await Modifiers.create(db, { sourceId, sourceType, target, value: "true", valueType: "boolean", operator: "set" });
}

/**
 * The names of the feats Add Level's picker offers on a plan of a class's `level`, in pool `aptitude`, searched by
 * `search`, with the feats and spells `picked` so far (by pool): a family's feats each by its name.
 */
async function offeredFeats(
  characterId: string,
  klass: string,
  level: number,
  aptitude: string,
  search: string,
  picked: Pick<PlanPicks, "feats" | "spells"> = {},
) {
  const ctx = await getSeedCtx();
  const plan = levelUpPlan([{ classId: ctx.classMap.pc[klass], level, hp: 1 }], picked);
  const at = { pool: ctx.aptMap[aptitude] };
  const options = await getStepOptions(session, characterId, "feats", plan, at, { limit: 20, search });
  if (!options.grouped) throw new Error("Expected the feats grouped");
  const names: string[] = [];
  for (const row of options.items) {
    if (row.group === null || row.count === 1) {
      names.push(row.name);
    } else {
      const group = { ...at, group: row.group };
      const members = await getStepOptions(session, characterId, "feats", plan, group, { limit: 20, search });
      names.push(...members.items.map(({ name }) => name));
    }
  }
  return names;
}

/**
 * The names of the spells Add Level's picker offers on a plan of a class's `level`, in pool `aptitude`, searched by
 * `search`, with the spells picked so far (by pool).
 */
async function offeredSpells(
  characterId: string,
  klass: string,
  level: number,
  aptitude: string,
  search: string,
  spells: PlanPicks["spells"] = {},
) {
  const ctx = await getSeedCtx();
  const plan = levelUpPlan([{ classId: ctx.classMap.pc[klass], level, hp: 1 }], { spells });
  const at = { pool: ctx.aptMap[aptitude] };
  const { items } = await getStepOptions(session, characterId, "spells", plan, at, { limit: 20, search });
  return items.map(({ name }) => name);
}

/** Gives the character the feats of these `slugs` by modifiers of its own (`set feats.<slug>.possessed`), as a race would. */
async function possess(characterId: string, slugs: string[]) {
  for (const slug of slugs) await give("characters", characterId, `feats.${slug}.possessed`);
}

/**
 * Add Level's answer of a plan of these class levels, each with the ability it increases (by id), and these picks:
 * each step by its mechanic.
 */
async function preview(
  ctx: SeedContext,
  characterId: string,
  levels: [string, number][],
  abilities: (string | null)[] = levels.map(() => null),
  plan: Omit<LevelPlan, "ability" | "hp"> = {},
) {
  const planned = levels.map(([klass, level], i) => ({
    abilityIncreases: increasesOf(abilities[i]),
    hp: 1,
    classId: ctx.classMap.pc[klass],
    level,
  }));
  return await getPlanAnswer(session, characterId, levelUpPlan(planned, picks(ctx, plan)));
}

/**
 * Saves a saved level's edit as its edit's plan opens it (`getLevelPlan`): its hit points, ability increases and
 * picks, its spells those of `spells` (by pool) when given.
 */
async function resaveAsRead(characterId: string, levelId: string, spells?: Record<string, string[]>) {
  const plan = await CharacterLevelsService.getLevelPlan(session, characterId, levelId);
  const steps = spells ? { ...plan.steps, spells: levelEditPlan({ hp: 1 }, { spells }).steps.spells } : plan.steps;
  return CharacterLevelsService.updatePlannedLevel(session, characterId, levelId, { ...plan, steps });
}

/** The names of the feats a character's levels saved, a row each, sorted. */
async function savedFeatNames(ctx: SeedContext, levelIds: string[]) {
  const names = new Map(Object.entries(ctx.featMap).map(([name, id]) => [id, name]));
  const rows = await findPicks("feats", levelIds);
  return rows.map(({ entityId }) => names.get(entityId!)).sort();
}

/** A saved level as its edit's plan opens it, read by kind. */
async function savedLevel(characterId: string, levelId: string) {
  return savedPicksOf(await CharacterLevelsService.getLevelPlan(session, characterId, levelId));
}

/** A fighter's first two levels, and the plan the first was saved with. */
async function setupFighter() {
  const ctx = await getSeedCtx();
  const characterId = await createSeedCharacter(ctx, "fighter", { xp: 1000 });
  const first = await levelUp(session, ctx, characterId, "Fighter", 1, FIGHTER_LEVELS[0]);
  await levelUp(session, ctx, characterId, "Fighter", 2, FIGHTER_LEVELS[1]);
  // The level's picks past the first fighter level's, and the ability its increase pick raises (`entityId`), if any
  const resave = (plan: Partial<LevelPlan> & { entityId?: string | null }, force = false) => {
    const picked = picks(ctx, { ...FIGHTER_LEVELS[0], ...plan });
    const edit = levelEditPlan({ hp: 10, abilityIncreases: increasesOf(plan.entityId) }, picked);
    return CharacterLevelsService.updatePlannedLevel(session, characterId, first.id, edit, force);
  };
  return { ctx, characterId, first, resave };
}

describe("finalizing several levels at once", () => {
  const WIZARD_FEATS = {
    "Wizard Specialization": ["Evocation Specialist"],
    "Prohibited School": ["Prohibit Illusion", "Prohibit Necromancy"],
    "Familiar Bond": ["Cat Familiar"],
  };
  const WIZARD_SPELLS = {
    "Wizard Spells": [
      "Detect Magic",
      "Read Magic",
      "Mage Hand",
      "Light",
      "Ray of Frost",
      "Resistance",
      "Magic Missile",
      "Shield",
      "Mage Armor",
    ],
  };
  const CASES: {
    build: keyof typeof BUILDS;
    levels: BatchLevel[];
    name: string;
    plan: Omit<LevelPlan, "hp">;
    values?: Parameters<typeof createSeedCharacter>[2];
  }[] = [
    {
      name: "a fighter's first four levels, with an ability increase at the fourth",
      build: "fighter",
      values: { xp: 6000 },
      levels: fighterLevels(4),
      plan: {
        skills: { Climb: 7, Intimidate: 7, Jump: 7, Swim: 7 },
        feats: {
          General: ["Power Attack", "Great Fortitude", "Toughness"],
          "Fighter Bonus Feat": ["Improved Initiative", "Dodge", "Combat Reflexes"],
        },
      },
    },
    {
      // Five cantrips and two first-level spells.
      name: "a sorcerer's first two levels, with their spells",
      build: "sorcerer",
      values: { xp: 1000 },
      levels: levelsOf("Sorcerer", [4, 4]),
      plan: {
        skills: { Bluff: 5, Concentration: 5, Spellcraft: 5, "Use Magic Device": 5 },
        feats: { General: ["Toughness", "Great Fortitude"], "Familiar Bond": ["Cat Familiar"] },
        spells: {
          "Sorcerer Spells": [
            "Detect Magic",
            "Light",
            "Read Magic",
            "Mage Hand",
            "Resistance",
            "Magic Missile",
            "Shield",
          ],
        },
      },
    },
    {
      // No bonus feat for an elf: one General feat at the first level.
      name: "an elf fighter's first two levels",
      build: "fighter",
      values: {
        xp: 3000,
        race: "Elf",
        languages: ["Common", "Elven"],
        abilities: { Strength: 10, Dexterity: 16, Constitution: 12, Intelligence: 14 },
      },
      levels: fighterLevels(2),
      plan: {
        skills: { Climb: 5, Intimidate: 5, Jump: 5, Swim: 5 },
        feats: { General: ["Dodge"], "Fighter Bonus Feat": ["Improved Initiative", "Combat Reflexes"] },
      },
    },
    {
      name: "a cleric's first two levels, with two domains",
      build: "cleric",
      values: { xp: 1000 },
      levels: levelsOf("Cleric", [8, 6]),
      plan: {
        skills: { Concentration: 5, Heal: 5, Spellcraft: 5, "Knowledge (Religion)": 5 },
        feats: { General: ["Toughness", "Great Fortitude"], "Cleric Domain": ["Healing Domain", "Sun Domain"] },
      },
    },
    {
      // Specializing opens the prohibited schools in the same level.
      name: "a wizard's first level, specialized with two prohibited schools",
      build: "wizard",
      values: { race: "Human", languages: ["Common"], abilities: { Intelligence: 16, Constitution: 14 } },
      levels: levelsOf("Wizard", [4]),
      plan: {
        skills: {
          Spellcraft: 4,
          Concentration: 4,
          "Knowledge (Arcana)": 4,
          "Decipher Script": 4,
          "Knowledge (Religion)": 4,
          "Knowledge (Nature)": 4,
        },
        feats: { General: ["Toughness", "Great Fortitude"], ...WIZARD_FEATS },
        spells: WIZARD_SPELLS,
      },
    },
    {
      name: "a fighter level, then a wizard level that gives up schools",
      build: "wizard",
      values: {
        xp: 3000,
        race: "Human",
        languages: ["Common"],
        abilities: { Strength: 10, Constitution: 14, Intelligence: 16, Charisma: 8 },
      },
      levels: [
        ["Fighter", 1, 10],
        ["Wizard", 1, 4],
      ],
      plan: {
        skills: {
          Climb: 4,
          Intimidate: 4,
          Jump: 4,
          Swim: 4,
          Spellcraft: 4,
          Concentration: 4,
          "Knowledge (Arcana)": 3,
          "Handle Animal": 3,
        },
        feats: {
          General: ["Toughness", "Great Fortitude"],
          "Fighter Bonus Feat": ["Improved Initiative"],
          ...WIZARD_FEATS,
        },
        spells: WIZARD_SPELLS,
      },
    },
    {
      name: "a ranger's first two levels, with a combat style",
      build: "fighter",
      values: { xp: 1000, abilities: { Strength: 14, Dexterity: 16, Constitution: 12, Wisdom: 14 } },
      levels: levelsOf("Ranger", [8, 6]),
      plan: {
        skills: {
          Hide: 4,
          "Move Silently": 4,
          Spot: 4,
          Listen: 4,
          Survival: 4,
          Climb: 4,
          Swim: 4,
          Search: 4,
          Jump: 4,
          "Handle Animal": 4,
        },
        feats: {
          General: ["Point Blank Shot", "Precise Shot"],
          "Ranger Combat Style (2nd)": ["Rapid Shot"],
          "Favored Enemy": ["Favored Enemy: Humanoid (Goblinoid)"],
        },
      },
    },
  ];

  test.each(CASES)("saves $name, every level passing validation", async ({ build, values, levels, plan }) => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx, build, values);
    const created = await finalizeBatch(ctx, characterId, levels, plan);
    expect(created).toHaveLength(levels.length);

    const levelIds = created.map((l) => l.id);
    const { feats, spells } = picks(ctx, plan);
    expect((await findPicks("feats", levelIds)).map((f) => f.entityId).sort()).toEqual(
      Object.values(feats).flat().sort(),
    );
    expect((await findPicks("spells", levelIds)).map((p) => p.entityId).sort()).toEqual(
      Object.values(spells).flat().sort(),
    );
    const increases = await findPicks("abilities", levelIds);
    expect(
      created.map((l) =>
        increases.filter((row) => row.advancementId === l.id).map(({ amount, entityId }) => ({ entityId, amount })),
      ),
    ).toEqual(levels.map(([, , , ability]) => increasesOf(ability && ctx.abilityMap[ability])));
  });

  test("spreads pooled skill ranks over the levels, within each level's rank cap", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx, "fighter", { xp: 1000 });
    // 16 points at the first level, 4 at the second; a first level caps ranks at 4.
    const [first, second] = await finalizeBatch(ctx, characterId, fighterLevels(2), {
      skills: { Climb: 5, Intimidate: 5, Jump: 5, Swim: 5 },
      feats: { General: ["Power Attack", "Great Fortitude"], "Fighter Bonus Feat": ["Improved Initiative", "Dodge"] },
    });
    const [atFirst, atSecond] = [await findPicks("skills", [first.id]), await findPicks("skills", [second.id])];
    expect(atFirst.every((s) => s.amount! <= 4)).toBe(true);
    expect(atSecond.length).toBeGreaterThan(0);
    expect([...atFirst, ...atSecond].reduce((sum, s) => sum + s.amount!, 0)).toBe(20);
  });

  test("refuses a batch whose picks don't fit its levels", async () => {
    const ctx = await getSeedCtx();
    const firstTwo = {
      General: ["Power Attack", "Great Fortitude"],
      "Fighter Bonus Feat": ["Improved Initiative", "Dodge"],
    };
    const refusals: [string | RegExp, () => Promise<unknown>][] = [
      // A level other than the first is checked too.
      [
        "HP must be between 1 and 10",
        async () =>
          finalizeBatch(
            ctx,
            await createSeedCharacter(ctx, "fighter", { xp: 1000 }),
            [
              ["Fighter", 1, 10],
              ["Fighter", 2, 999],
            ],
            { skills: { Climb: 5, Intimidate: 5, Jump: 5, Swim: 5 }, feats: firstTwo },
          ),
      ],
      // Errors name the character's level they're about.
      [
        "Level 4: Ability increase is required at this level",
        async () => {
          const characterId = await createSeedCharacter(ctx, "fighter", { xp: 6000 });
          await addFighterLevels(session, ctx, characterId, 3);
          return finalizeBatch(ctx, characterId, [["Fighter", 4, 8]], {
            skills: { Climb: 4 },
            feats: { "Fighter Bonus Feat": ["Combat Reflexes"] },
          });
        },
      ],
      [
        "Level 1: Ability increase is not available at this level",
        async () =>
          finalizeBatch(
            ctx,
            await createSeedCharacter(ctx),
            [["Fighter", 1, 10, "Strength"]],
            { skills: { Climb: 16 }, feats: FIGHTER_LEVELS[0].feats },
            true,
          ),
      ],
      [
        "unspent",
        async () =>
          finalizeBatch(ctx, await createSeedCharacter(ctx, "fighter", { xp: 1000 }), fighterLevels(2), {
            skills: { Climb: 20 },
            feats: { General: ["Power Attack"], "Fighter Bonus Feat": ["Improved Initiative", "Dodge"] },
          }),
      ],
      // A third General feat, which the pool has no room for: refused, where it used to be dropped (#476)
      [
        "General: 3 picked, room for 2",
        async () =>
          finalizeBatch(ctx, await createSeedCharacter(ctx), fighterLevels(1), {
            skills: { Climb: 16 },
            feats: {
              General: ["Power Attack", "Great Fortitude", "Toughness"],
              "Fighter Bonus Feat": ["Improved Initiative"],
            },
          }),
      ],
      // A feat that doesn't stack, in two pools.
      [
        'Non-stackable feat "Power Attack" cannot be picked more than once',
        async () =>
          finalizeBatch(ctx, await createSeedCharacter(ctx, "fighter", { xp: 1000 }), fighterLevels(2), {
            skills: { Climb: 20 },
            feats: { General: ["Power Attack", "Great Fortitude"], "Fighter Bonus Feat": ["Power Attack"] },
          }),
      ],
    ];
    for (const [error, attempt] of refusals) {
      // One at a time: the test's transaction has a single connection.
      expect(attempt()).rejects.toThrow(error);
    }
    expect(finalizeBatch(ctx, NIL_UUID, fighterLevels(1), {})).rejects.toThrow(NotFoundError);
  });

  test("refuses a class level the batch takes twice: the second sees the first", async () => {
    const ctx = await getSeedCtx();
    const firstTwo = {
      General: ["Power Attack", "Great Fortitude"],
      "Fighter Bonus Feat": ["Improved Initiative", "Dodge"],
    };
    const twice = finalizeBatch(
      ctx,
      await createSeedCharacter(ctx, "fighter", { xp: 1000 }),
      [
        ["Fighter", 1, 10],
        ["Fighter", 1, 10],
      ],
      { skills: { Climb: 16 }, feats: FIGHTER_LEVELS[0].feats },
    );
    expect(twice).rejects.toMatchObject({
      message: "Level 2: This level has already been finalized",
      refusal: "invalid",
    });
    const thirdRepeatsSecond = finalizeBatch(
      ctx,
      await createSeedCharacter(ctx, "fighter", { xp: 3000 }),
      [...fighterLevels(2), ["Fighter", 2, 6]],
      { skills: { Climb: 20 }, feats: firstTwo },
    );
    expect(thirdRepeatsSecond).rejects.toMatchObject({
      message: "Level 3: This level has already been finalized",
      refusal: "invalid",
    });
  });
});

describe("a pool's room", () => {
  const GENERAL_THREE = ["Power Attack", "Great Fortitude", "Toughness"];

  test("refuses a save's picks a pool with slots has no room for, forced or not, naming it", async () => {
    const ctx = await getSeedCtx();
    const plan = { skills: { Climb: 16 }, feats: { General: GENERAL_THREE, "Fighter Bonus Feat": ["Dodge"] } };
    for (const force of [false, true]) {
      const characterId = await createSeedCharacter(ctx);
      expect(finalizeBatch(ctx, characterId, fighterLevels(1), plan, force)).rejects.toThrow(
        "General: 3 picked, room for 2",
      );
    }
  });

  test("refuses a third school a wizard's specialization opens room for two of, forced or not", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx, "wizard");
    const schools = ["Prohibit Illusion", "Prohibit Necromancy", "Prohibit Enchantment"];
    const plan = { ...WIZARD_1, feats: { ...WIZARD_1.feats, "Prohibited School": schools } };
    expect(levelUp(session, ctx, characterId, "Wizard", 1, plan, true)).rejects.toThrow(
      "Prohibited School: 3 picked, room for 2",
    );
  });

  test("refuses an edit's picks a pool has no room for, forced or not", async () => {
    const { resave } = await setupFighter();
    const plan = { feats: { General: GENERAL_THREE, "Fighter Bonus Feat": ["Improved Initiative"] } };
    for (const force of [false, true]) expect(resave(plan, force)).rejects.toThrow("General: 3 picked, room for 2");
  });

  test("fits a preview's picks to their pools: a pool past its room drops its latest", async () => {
    const ctx = await getSeedCtx();
    const result = await preview(ctx, await createSeedCharacter(ctx), fighter(1), undefined, {
      feats: { General: GENERAL_THREE },
    });
    const general = ctx.aptMap["General"];
    const { feats } = pickSteps(result);
    expect(feats.fitted[general]).toEqual([ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]]);
    // Its room for the feats picked in it: what it had left, before them
    expect(feats.pools[general]).toMatchObject({ allowed: 2, available: 2, spent: 0 });
  });

  test("grows a pool by a picked feat's room, and drops what's in it with the feat", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx, "wizard");
    const schools = ["Prohibit Illusion", "Prohibit Necromancy"];
    const specialized = { "Wizard Specialization": ["Evocation Specialist"], "Prohibited School": schools };
    const withFeat = await preview(ctx, characterId, [["Wizard", 1]], undefined, { feats: specialized });
    const prohibited = ctx.aptMap["Prohibited School"];
    expect(pickSteps(withFeat).feats.pools[prohibited]).toMatchObject({ available: 2 });
    expect(pickSteps(withFeat).feats.fitted[prohibited]).toHaveLength(2);
    const without = await preview(ctx, characterId, [["Wizard", 1]], undefined, {
      feats: { "Prohibited School": schools },
    });
    expect(pickSteps(without).feats.fitted[prohibited]).toEqual([]);
  });

  test("answers an edited level's feat step with its room for the picks, and what of them fits", async () => {
    const { ctx, characterId, first } = await setupFighter();
    const general = ctx.aptMap["General"];
    const answer = await editAnswer(characterId, first.id, {
      feats: { [general]: GENERAL_THREE.map((name) => ctx.featMap[name]) },
    });
    const step = stepAnswerOf(answer, "feats", "pick");
    expect(step.fitted[general]).toEqual([ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]]);
    expect(step.pools[general]).toMatchObject({ available: 2 });
  });
});

describe("a pick a level takes twice", () => {
  const TOUGHNESS_TWICE = { General: ["Toughness", "Toughness"], "Fighter Bonus Feat": ["Improved Initiative"] };
  const FIGHTER_1_SKILLS = { Climb: 4, Intimidate: 4, Jump: 4, Swim: 4 };

  test("saves a stacking feat a level picks twice in its pool, forced or not: a row each, read back, both counted", async () => {
    const ctx = await getSeedCtx();
    const general = ctx.aptMap["General"];
    for (const force of [false, true]) {
      const characterId = await createSeedCharacter(ctx);
      const plan = { skills: FIGHTER_1_SKILLS, feats: TOUGHNESS_TWICE };
      const [level] = await finalizeBatch(ctx, characterId, fighterLevels(1), plan, force);
      expect(await savedFeatNames(ctx, [level.id])).toEqual(["Improved Initiative", "Toughness", "Toughness"]);
      const saved = await savedLevel(characterId, level.id);
      expect(saved.feats[general]).toEqual([ctx.featMap["Toughness"], ctx.featMap["Toughness"]]);
      // 10 rolled, 2 for Constitution 14, and 3 for each Toughness
      expect((await sheetOf(characterId)).combat.hp.total).toBe(18);
    }
  });

  test("saves a stacking feat a level picks under two pools", async () => {
    const ctx = await getSeedCtx();
    // A fork whose Toughness is a fighter's bonus feat too
    const fork = await createSeededTestRuleset(SEED_USER_ID);
    const toughness = await copyEntity(db, "feats", ctx.featMap["Toughness"], fork);
    await addLists(db, "feats", toughness.id, [{ toId: ctx.aptMap["Fighter Bonus Feat"] }]);
    RulesetViews.invalidate(fork.id);
    const characterId = await createSeedCharacter(ctx);
    await Characters.update(db, { rulesetId: fork.id }, { id: characterId });

    const { skills } = picks(ctx, { skills: FIGHTER_1_SKILLS });
    const feats = {
      [ctx.aptMap["General"]]: [toughness.id, ctx.featMap["Power Attack"]],
      [ctx.aptMap["Fighter Bonus Feat"]]: [toughness.id],
    };
    const levels = [{ classId: ctx.classMap.pc["Fighter"], level: 1, hp: 10, abilityIncreases: [] }];
    const [level] = await CharacterLevelsService.addLevels(
      session,
      characterId,
      levelUpPlan(levels, { skills, feats }),
    );
    const rows = await findPicks("feats", [level.id]);
    expect(
      rows
        .filter(({ entityId }) => entityId === toughness.id)
        .map(({ viaId }) => viaId)
        .sort(),
    ).toEqual([ctx.aptMap["General"], ctx.aptMap["Fighter Bonus Feat"]].sort());
  });

  test("refuses a feat that doesn't stack, or a spell, a level picks twice in its pool, forced or not, naming it", async () => {
    const ctx = await getSeedCtx();
    const powerAttackTwice = { General: ["Power Attack", "Power Attack"], "Fighter Bonus Feat": ["Dodge"] };
    const lightTwice = {
      ...SORCERER_1,
      spells: { "Sorcerer Spells": ["Detect Magic", "Light", "Light", "Read Magic"] },
    };
    for (const force of [false, true]) {
      const fighterId = await createSeedCharacter(ctx);
      const plan = { skills: FIGHTER_1_SKILLS, feats: powerAttackTwice };
      expect(finalizeBatch(ctx, fighterId, fighterLevels(1), plan, force)).rejects.toMatchObject({
        message: 'Non-stackable feat "Power Attack" cannot be picked more than once',
        refusal: "invalid",
      });
      const sorcererId = await createSeedCharacter(ctx, "sorcerer");
      expect(levelUp(session, ctx, sorcererId, "Sorcerer", 1, lightTwice, force)).rejects.toMatchObject({
        message: 'Spell "Light" cannot be picked more than once at a level',
        refusal: "invalid",
      });
    }
  });

  test("edits a level to pick a stacking feat twice, and refuses one that doesn't stack", async () => {
    const { ctx, first, resave } = await setupFighter();
    await resave({ feats: TOUGHNESS_TWICE });
    expect(await savedFeatNames(ctx, [first.id])).toEqual(["Improved Initiative", "Toughness", "Toughness"]);
    const powerAttackTwice = {
      General: ["Power Attack", "Power Attack"],
      "Fighter Bonus Feat": ["Improved Initiative"],
    };
    expect(resave({ feats: powerAttackTwice }, true)).rejects.toThrow(
      'Non-stackable feat "Power Attack" cannot be picked more than once',
    );
  });

  // #588: the preview kept a pool's repeated stacking feat once, while the save kept both or refused them by pick order
  test("previews and saves a stacking feat picked twice in a pool of a plan alike, in either order", async () => {
    const ctx = await getSeedCtx();
    // Fighter 1 to 3: two General feats at the first level and one at the third, a bonus feat at the first two
    const skills = { Climb: 6, Intimidate: 6, Jump: 6, Swim: 6 };
    for (const general of [
      ["Toughness", "Power Attack", "Toughness"],
      ["Toughness", "Toughness", "Power Attack"],
    ]) {
      const plan = { skills, feats: { General: general, "Fighter Bonus Feat": ["Improved Initiative", "Dodge"] } };
      const previewed = await preview(ctx, await createSeedCharacter(ctx), fighter(3), undefined, plan);
      expect(pickSteps(previewed).feats.fitted[ctx.aptMap["General"]]).toEqual(
        general.map((name) => ctx.featMap[name]),
      );

      const characterId = await createSeedCharacter(ctx);
      const levelIds = (await finalizeBatch(ctx, characterId, fighterLevels(3), plan)).map(({ id }) => id);
      expect(await savedFeatNames(ctx, levelIds)).toEqual(["Dodge", "Improved Initiative", ...general].sort());
    }
  });
});

describe("previewing a level-up", () => {
  test("describes each level, its skill points and where the ability increase falls", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx);
    const result = await preview(ctx, characterId, fighter(4));

    expect(result.advancements).toMatchObject(
      fighter(4).map(([, level]) => ({ position: level, track: { id: ctx.classMap.pc["Fighter"], name: "Fighter" } })),
    );
    // A d10's: 1 to 10, 5 on average, which the HP step reads
    expect(stepAnswerOf(result, "hp", "value").advancements).toEqual(
      fighter(4).map(() => ({ average: 5, max: 10, min: 1, roll: "d10" })),
    );
    const skills = stepAnswerOf(result, "skills", "spend");
    expect(skills).toMatchObject({ budget: 28, perAdvancement: [16, 4, 4, 4] });
    expect(skills.rows.length).toBeGreaterThan(0);
    // The fourth level of the batch, by its index.
    expect(stepAnswerOf(result, "abilities", "choose").advancements).toEqual([3]);

    await addFighterLevels(session, ctx, characterId, 1);
    // Only a character's first level gets ×4.
    const second = await preview(ctx, characterId, [["Fighter", 2]]);
    expect(stepAnswerOf(second, "skills", "spend").perAdvancement).toEqual([4]);
    expect(preview(ctx, NIL_UUID, fighter(1))).rejects.toThrow(NotFoundError);
  });

  test("shows the base attributes, raised only by the increases chosen at the levels that take one", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx);
    const intelligence = async (abilities: (string | null)[]) =>
      stepAnswerOf(await preview(ctx, characterId, fighter(4), abilities), "abilities", "choose").options.find(
        (ability) => ability.id === ctx.abilityMap["Intelligence"],
      )!;
    expect((await intelligence([null, null, null, null])).score).toBe(12);
    expect(await intelligence([null, null, null, ctx.abilityMap["Intelligence"]])).toMatchObject({
      name: "Intelligence",
      score: 13,
      modifier: 1,
    });
    // A pick the plan moved off an increase level (the first takes none) raises nothing
    expect((await intelligence([ctx.abilityMap["Intelligence"], null, null, null])).score).toBe(12);
  });

  test("says whether the increases are picked at every level that takes one, as the save checks them", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx);
    const picked = async (levels: number, abilities: (string | null)[]) =>
      stepAnswerOf(await preview(ctx, characterId, fighter(levels), abilities), "abilities", "choose").chosen;
    const intelligence = ctx.abilityMap["Intelligence"];
    // One at a time: the test's transaction has a single connection
    expect(await picked(4, [null, null, null, null])).toBe(false);
    expect(await picked(4, [intelligence, null, null, null])).toBe(false);
    expect(await picked(4, [null, null, null, intelligence])).toBe(true);
    // A plan without a level that takes one has nothing to pick
    expect(await picked(3, [null, null, null])).toBe(true);
  });

  test("raises every level's skill points with an Intelligence increase, as 3.5 grants them retroactively", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx, "fighter", { abilities: { Intelligence: 13 } });
    const raised = await preview(ctx, characterId, fighter(4), [null, null, null, ctx.abilityMap["Intelligence"]]);
    // Each level's 2 + 2 (INT 14), and the human's 1 beside: 20 at the first level, 5 at the others
    expect(stepAnswerOf(raised, "skills", "spend")).toMatchObject({ budget: 35, perAdvancement: [20, 5, 5, 5] });
  });

  test("spends the skill points as the save spreads them, each skill with its ranks by points", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx);
    const answer = await preview(ctx, characterId, fighter(1), [null], { skills: { Climb: 6, Hide: 3 } });
    const { rows } = stepAnswerOf(answer, "skills", "spend");
    const skill = (name: string) => rows.find((s) => s.id === ctx.skillMap[name])!;
    // Climb, a fighter's class skill, caps at 4 ranks at level 1: its 2 points over the cap aren't kept
    expect(skill("Climb")).toMatchObject({
      favored: true,
      points: 4,
      value: 4,
      step: 1,
      valuesByPoints: [0, 1, 2, 3, 4],
      maxPoints: 4,
    });
    // Hide, cross-class, takes two points a rank, up to 2 ranks
    expect(skill("Hide")).toMatchObject({ favored: false, points: 3, value: 1.5, step: 0.5 });
    expect(skill("Hide").valuesByPoints).toEqual([0, 0.5, 1, 1.5, 2]);
    // A skill no points went to reads what it would gain, within the points the others leave
    expect(skill("Swim")).toMatchObject({ points: 0, value: 0, maxPoints: 4 });
    expect(skill("Swim").valuesByPoints).toEqual([0, 1, 2, 3, 4]);
  });

  test("spends a multiclass plan's skill points class-skill levels first, in the form's order", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx);
    // A human fighter's 16 points at the first level, a fighter's, and 10 at the second, a rogue's: Ride is the
    // fighter's class skill alone, Climb, Intimidate, Jump and Swim both classes'
    const plan = [
      ["Fighter", 1],
      ["Rogue", 1],
    ] satisfies [string, number][];
    const spend = async (skills: Record<string, number>) => {
      const { rows } = stepAnswerOf(await preview(ctx, characterId, plan, undefined, { skills }), "skills", "spend");
      return (name: string) => rows.find((s) => s.id === ctx.skillMap[name])!;
    };
    // The other four spend the fighter level's points: Ride is left the rogue level's, cross-class there
    const last = await spend({ Climb: 4, Intimidate: 4, Jump: 4, Swim: 4, Ride: 4 });
    expect(last("Ride")).toMatchObject({
      points: 4,
      value: 2,
      valuesByPoints: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5],
    });
    // Ride first takes the fighter level's, a rank a point, and Swim, the last, the rogue level's
    const first = await spend({ Ride: 4, Climb: 4, Intimidate: 4, Jump: 4, Swim: 4 });
    expect([first("Ride").value, first("Swim").value]).toEqual([4, 4]);
    // Alone, Ride takes the fighter level's 4 ranks, then half a rank a point at the rogue level, up to its cap of 5
    const alone = await spend({});
    expect(alone("Ride")).toMatchObject({ maxPoints: 6, step: 1, valuesByPoints: [0, 1, 2, 3, 4, 4.5, 5] });
    expect(alone("Hide")).toMatchObject({ favored: true, step: 1 });
    expect(alone("Concentration")).toMatchObject({ favored: false, step: 0.5 });
  });

  test("marks a multiclass plan's class skills as the character's classes make them, a single class's as its own", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx);
    await addCharacterLevel(characterId, (await findClassLevel(ctx.classMap.pc["Fighter"], 1))!.id);
    const ride = async (plan: [string, number][]) =>
      stepAnswerOf(await preview(ctx, characterId, plan), "skills", "spend").rows.find(
        (s) => s.id === ctx.skillMap["Ride"],
      )!;
    // Ride is the saved fighter level's class skill, neither planned class's: a rank costs two points at both
    expect(
      await ride([
        ["Rogue", 1],
        ["Wizard", 1],
      ]),
    ).toMatchObject({ favored: true, step: 0.5 });
    expect(
      await ride([
        ["Rogue", 1],
        ["Rogue", 2],
      ]),
    ).toMatchObject({ favored: false, step: 0.5 });
  });

  test("counts a human's bonus feat in the first level's General slots: its next feat goes there, then on the third", async () => {
    const ctx = await getSeedCtx();
    const nextGeneral = async (characterId: string, count: number, general: string[]) => {
      const result = await preview(ctx, characterId, fighter(count), undefined, { feats: { General: general } });
      return pickSteps(result).feats.next[ctx.aptMap.General][""];
    };
    // A human's bonus feat and its first level's: two at the first level, then one at the third
    const human = await createSeedCharacter(ctx);
    expect(await nextGeneral(human, 4, [])).toBe(0);
    expect(await nextGeneral(human, 4, ["Power Attack"])).toBe(0);
    expect(await nextGeneral(human, 4, ["Power Attack", "Great Fortitude"])).toBe(2);
    // An elf's first level's alone: once it's taken, a pick goes on the last level
    const elf = await createSeedCharacter(ctx, "fighter", { race: "Elf", languages: ["Common", "Elven"] });
    expect(await nextGeneral(elf, 2, [])).toBe(0);
    expect(await nextGeneral(elf, 2, ["Power Attack"])).toBe(1);
  });

  test("gives a sorcerer's spell pool cantrip and first-level slots at each level", async () => {
    const ctx = await getSeedCtx();
    const sorcerer = await createSeedCharacter(ctx, "sorcerer");
    const levels: [string, number][] = [
      ["Sorcerer", 1],
      ["Sorcerer", 2],
    ];
    const { spells } = pickSteps(await preview(ctx, sorcerer, levels));
    const pool = Object.values(spells.pools).find(({ name }) => name === "Sorcerer Spells")!;
    // A leveled pool: its room by spell level
    expect(pool.tiers).toBeDefined();
    expect(pool.tiers?.["0"]?.available).toBeGreaterThan(0);
    expect(pool.tiers?.["1"]?.available).toBeGreaterThan(0);
    expect(spells.next[pool.id]).toMatchObject({ "0": 0, "1": 0 });
    // The first level's four cantrips taken, the next goes on the second
    const cantrips = ["Detect Magic", "Light", "Read Magic", "Mage Hand"];
    const picked = await preview(ctx, sorcerer, levels, undefined, { spells: { "Sorcerer Spells": cantrips } });
    expect(pickSteps(picked).spells.next[pool.id]["0"]).toBe(1);
    expect(pickSteps(picked).spells.fitted[pool.id]).toEqual(cantrips.map((name) => ctx.spellMap[name]));
  });
  test("gives a spell level the character knows all of no slot from a later level's add", async () => {
    const ctx = await getSeedCtx();
    const cleric = ctx.classMap.pc["Cleric"];
    const characterId = await createSeedCharacter(ctx);
    // A saved cleric level: she knows all her 1st-level spells
    await addCharacterLevel(characterId, (await findClassLevel(cleric, 1))!.id);
    await Modifiers.create(db, {
      sourceId: (await findClassLevel(cleric, 2))!.id,
      sourceType: "class-levels",
      target: "aptitudes.clericspells.1.allowed",
      operator: "add",
      value: "1",
      valueType: "number",
    });
    invalidateSeededRuleset(ctx.rulesetId);
    const { spells } = pickSteps(
      await preview(ctx, characterId, [
        ["Cleric", 2],
        ["Cleric", 3],
      ]),
    );
    // The second level's add gives no 1st-level slot: a 1st-level pick goes on the last planned level
    expect(spells.next[ctx.aptMap["Cleric Spells"]]["1"]).toBe(1);
  });
});

describe("the feats of a level in a batch", () => {
  test("count what earlier levels of the batch pick", async () => {
    // Cleave needs Power Attack.
    expect(await eligible("Cleave", 1)).toBe(false);
    expect(await eligible("Cleave", 1, { pendingPicks: ["Power Attack"] })).toBe(true);
    expect(await eligible("Cleave", 4, { pendingPicks: ["Power Attack"] })).toBe(true);
  });

  test("count the picked level once", async () => {
    // Leadership needs character level 6: picked at the batch's 5th level, the character has 5
    expect(await eligible("Leadership", 5)).toBe(false);
    expect(await eligible("Leadership", 6)).toBe(true);
  });

  test("count the batch's ability increases", async () => {
    // Power Attack needs STR 13.
    expect(await eligible("Power Attack", 4, { strength: 12 })).toBe(false);
    expect(
      await eligible("Power Attack", 4, {
        strength: 12,
        increases: [undefined, undefined, undefined, (await getSeedCtx()).abilityMap["Strength"]],
      }),
    ).toBe(true);
  });
});

describe("a spell known once in its class list", () => {
  const KNOWN_LIGHT = { message: 'Spell "Light" is already known in Sorcerer Spells', refusal: "invalid" };
  /** A sorcerer's second level: its skill points, and its one more cantrip when it picks one. */
  const SORCERER_2 = { hp: 4, skills: { Bluff: 1, Concentration: 1, Spellcraft: 1, "Knowledge (Arcana)": 1 } };
  /** A sorcerer's first two levels, but their spells: five cantrips and two first-level spells. */
  const SORCERER_1_TO_2 = {
    skills: { Bluff: 5, Concentration: 5, Spellcraft: 5, "Use Magic Device": 5 },
    feats: { General: ["Toughness", "Great Fortitude"], "Familiar Bond": ["Cat Familiar"] },
  };

  test("refuses a spell picked again in its list, saved at a level or planned at an earlier one, forced or not", async () => {
    const ctx = await getSeedCtx();
    // The second Light goes on the second level, past the first level's four cantrips
    const lightTwice = ["Detect Magic", "Light", "Read Magic", "Mage Hand", "Light", "Magic Missile", "Shield"];
    for (const force of [false, true]) {
      const savedId = await createSeedCharacter(ctx, "sorcerer", { xp: 1000 });
      await levelUp(session, ctx, savedId, "Sorcerer", 1, SORCERER_1);
      const lightAgain = { ...SORCERER_2, spells: { "Sorcerer Spells": ["Light"] } };
      expect(levelUp(session, ctx, savedId, "Sorcerer", 2, lightAgain, force)).rejects.toMatchObject(KNOWN_LIGHT);

      const plannedId = await createSeedCharacter(ctx, "sorcerer", { xp: 1000 });
      const plan = { ...SORCERER_1_TO_2, spells: { "Sorcerer Spells": lightTwice } };
      expect(finalizeBatch(ctx, plannedId, levelsOf("Sorcerer", [4, 4]), plan, force)).rejects.toMatchObject(
        KNOWN_LIGHT,
      );
    }
  });

  test("refuses a spell a modifier makes known in its list, forced or not, and previews it dropped", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx, "wizard");
    await Modifiers.create(db, {
      sourceId: characterId,
      sourceType: "characters",
      target: "spells.magicmissile.wizard.known",
      value: "true",
      valueType: "boolean",
      operator: "set",
    });
    for (const force of [false, true]) {
      expect(levelUp(session, ctx, characterId, "Wizard", 1, WIZARD_1, force)).rejects.toMatchObject({
        message: 'Spell "Magic Missile" is already known in Wizard Spells',
        refusal: "invalid",
      });
    }
    const previewed = await preview(ctx, characterId, [["Wizard", 1]], undefined, { spells: WIZARD_1.spells });
    expect(pickSteps(previewed).spells.fitted[ctx.aptMap["Wizard Spells"]]).not.toContain(
      ctx.spellMap["Magic Missile"],
    );
  });

  test("previews a spell picked again in its list as the save refuses it: dropped, and the rest saved", async () => {
    const ctx = await getSeedCtx();
    const sorcererSpells = ctx.aptMap["Sorcerer Spells"];
    const idsOf = (names: string[]) => names.map((name) => ctx.spellMap[name]);
    // A plan's second Light, past the first level's four cantrips
    const plannedId = await createSeedCharacter(ctx, "sorcerer", { xp: 1000 });
    const kept = ["Detect Magic", "Light", "Read Magic", "Mage Hand", "Resistance", "Magic Missile", "Shield"];
    const picked = { spells: { "Sorcerer Spells": [...kept.slice(0, 4), "Light", ...kept.slice(4)] } };
    const sorcerer1To2: [string, number][] = [
      ["Sorcerer", 1],
      ["Sorcerer", 2],
    ];
    const planned = await preview(ctx, plannedId, sorcerer1To2, undefined, picked);
    expect(pickSteps(planned).spells.fitted[sorcererSpells]).toEqual(idsOf(kept));
    const plan = { ...SORCERER_1_TO_2, spells: { "Sorcerer Spells": kept } };
    expect(await finalizeBatch(ctx, plannedId, levelsOf("Sorcerer", [4, 4]), plan)).toHaveLength(2);

    // A saved level's Light, picked again at the next
    const savedId = await createSeedCharacter(ctx, "sorcerer", { xp: 1000 });
    await levelUp(session, ctx, savedId, "Sorcerer", 1, SORCERER_1);
    const next = await preview(ctx, savedId, [["Sorcerer", 2]], undefined, {
      spells: { "Sorcerer Spells": ["Light", "Resistance"] },
    });
    expect(pickSteps(next).spells.fitted[sorcererSpells]).toEqual(idsOf(["Resistance"]));
    await levelUp(session, ctx, savedId, "Sorcerer", 2, {
      ...SORCERER_2,
      spells: { "Sorcerer Spells": ["Resistance"] },
    });
  });

  test("lets a spell known in one class's list be picked in another's, previewed and saved", async () => {
    const ctx = await getSeedCtx();
    const wizardSpells = ctx.aptMap["Wizard Spells"];
    const characterId = await createSeedCharacter(ctx, "sorcerer", { xp: 1000 });
    await levelUp(session, ctx, characterId, "Sorcerer", 1, SORCERER_1);
    const wizardLight = { spells: { "Wizard Spells": ["Light"] } };
    const previewed = await preview(ctx, characterId, [["Wizard", 1]], undefined, wizardLight);
    expect(pickSteps(previewed).spells.fitted[wizardSpells]).toEqual([ctx.spellMap["Light"]]);
    // Forced: the wizard level's other picks aren't this test's
    const [level] = await finalizeBatch(ctx, characterId, [["Wizard", 1, 4]], wizardLight, true);
    const saved = await findPicks("spells", [level.id]);
    expect(saved.map(({ entityId, viaId }) => ({ entityId, viaId }))).toEqual([
      { entityId: ctx.spellMap["Light"], viaId: wizardSpells },
    ]);
  });

  test("refuses a spell a modifier makes known in its list though another class's list picked it, forced or not", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx, "sorcerer", { xp: 1000 });
    await Modifiers.create(db, {
      sourceId: characterId,
      sourceType: "characters",
      target: "spells.light.sorcerer.known",
      value: "true",
      valueType: "boolean",
      operator: "set",
    });
    // The wizard's spellbook's Light, which the wizard's list doesn't know. Forced: the level's other picks aren't this
    // test's
    await finalizeBatch(ctx, characterId, [["Wizard", 1, 4]], { spells: { "Wizard Spells": ["Light"] } }, true);
    const sorcererLight = { spells: { "Sorcerer Spells": ["Light"] } };
    const lightLevel = { hp: 4, ...sorcererLight };
    for (const force of [false, true])
      expect(levelUp(session, ctx, characterId, "Sorcerer", 1, lightLevel, force)).rejects.toMatchObject(KNOWN_LIGHT);
    const previewed = await preview(ctx, characterId, [["Sorcerer", 1]], undefined, sorcererLight);
    expect(pickSteps(previewed).spells.fitted[ctx.aptMap["Sorcerer Spells"]]).toEqual([]);
  });

  test("lists a cleric spell a cleric/wizard's spellbook has on his cleric's list too, each at its class's DC", async () => {
    const ctx = await getSeedCtx();
    const abilities = { Intelligence: 16, Wisdom: 14 };
    const characterId = await createSeedCharacter(ctx, "fighter", { xp: 1000, abilities });
    // Forced: the levels' other picks aren't this test's
    const spellbook = { hp: 4, spells: { "Wizard Spells": ["Protection from Evil"] } };
    await levelUp(session, ctx, characterId, "Wizard", 1, spellbook, true);
    await levelUp(session, ctx, characterId, "Cleric", 1, WAR_CLERIC_1, true);

    const { spellGroups } = await sheetOf(characterId);
    const protection = (list: string) =>
      spellGroups
        .find((apt) => apt.aptitudeName === list)
        ?.levels.find((group) => group.level === 1)
        ?.spells.find((spell) => spell.name === "Protection from Evil");
    // Wisdom 14 (+2) for the cleric's, with his Good domain's tag; Intelligence 16 (+3) for the wizard's
    expect([protection("Cleric Spells"), protection("Wizard Spells")]).toMatchObject([
      { dc: 10 + 1 + 2, tags: [{ name: "Good Domain" }] },
      { dc: 10 + 1 + 3 },
    ]);
  });

  test("keeps a spell a level knows again from before the rule: each level edits as it reads, a new repeat refused", async () => {
    const ctx = await getSeedCtx();
    const sorcererSpells = ctx.aptMap["Sorcerer Spells"];
    const [light, detectMagic] = [ctx.spellMap["Light"], ctx.spellMap["Detect Magic"]];
    const characterId = await createSeedCharacter(ctx, "sorcerer", { xp: 1000 });
    const first = await levelUp(session, ctx, characterId, "Sorcerer", 1, SORCERER_1);
    // A second level that knows Light again, saved before the rule: written straight to the database
    const { skills } = picks(ctx, SORCERER_2);
    const second = await addCharacterLevel(characterId, (await findClassLevel(ctx.classMap.pc["Sorcerer"], 2))!.id, {
      spells: { [sorcererSpells]: [light] },
      skills,
    });

    for (const level of [first, second]) await resaveAsRead(characterId, level.id);
    // Its step keeps its own Light, and drops a spell the first level knows, as its save refuses it
    const answer = await editAnswer(characterId, second.id, { spells: { [sorcererSpells]: [light, detectMagic] } });
    expect(pickSteps(answer).spells.fitted[sorcererSpells]).toEqual([light]);
    expect(resaveAsRead(characterId, second.id, { [sorcererSpells]: [detectMagic] })).rejects.toMatchObject({
      message: 'Spell "Detect Magic" is already known in Sorcerer Spells',
      refusal: "invalid",
    });
  });
});

describe("a feat that doesn't stack, held once", () => {
  test("refuses a feat a modifier gives the character, forced or not, as the picker leaves it out and the preview drops it", async () => {
    const ctx = await getSeedCtx();
    // An elf, whose race gives her Martial Weapon Proficiency: Longsword, and a human, whose race doesn't
    const proficiency = "Martial Weapon Proficiency: Longsword";
    const elf = await createSeedCharacter(ctx, "wizard");
    const human = await createSeedCharacter(ctx, "sorcerer");
    expect(await offeredFeats(human, "Wizard", 1, "General", proficiency)).toEqual([proficiency]);
    expect(await offeredFeats(elf, "Wizard", 1, "General", proficiency)).toEqual([]);

    const plan = { ...WIZARD_1, feats: { ...WIZARD_1.feats, General: [proficiency] } };
    const previewed = await preview(ctx, elf, [["Wizard", 1]], undefined, { feats: plan.feats });
    expect(pickSteps(previewed).feats.fitted[ctx.aptMap["General"]]).toEqual([]);
    for (const force of [false, true])
      expect(levelUp(session, ctx, elf, "Wizard", 1, plan, force)).rejects.toMatchObject(alreadyHeld(proficiency));
  });

  test("refuses a feat another level picked, forced or not, as the picker leaves it out and the preview drops it", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx, "fighter", { xp: 1000 });
    // The first level picked Power Attack, which the second's bonus feat picks again
    await levelUp(session, ctx, characterId, "Fighter", 1, FIGHTER_LEVELS[0]);
    expect(await offeredFeats(characterId, "Fighter", 2, "Fighter Bonus Feat", "Power Attack")).toEqual([]);
    const plan = { ...FIGHTER_LEVELS[1], feats: { "Fighter Bonus Feat": ["Power Attack"] } };
    const previewed = await preview(ctx, characterId, [["Fighter", 2]], undefined, { feats: plan.feats });
    expect(pickSteps(previewed).feats.fitted[ctx.aptMap["Fighter Bonus Feat"]]).toEqual([]);
    for (const force of [false, true]) {
      expect(levelUp(session, ctx, characterId, "Fighter", 2, plan, force)).rejects.toMatchObject(
        alreadyHeld("Power Attack"),
      );
    }
  });

  test("lets a feat that stacks be picked though the character has it, twice at a level too, previewed and saved", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx);
    await possess(characterId, ["toughness"]);
    expect(await offeredFeats(characterId, "Fighter", 1, "General", "Toughness")).toEqual(["Toughness"]);

    const plan = {
      ...FIGHTER_LEVELS[0],
      feats: { General: ["Toughness", "Toughness"], "Fighter Bonus Feat": ["Dodge"] },
    };
    const previewed = await preview(ctx, characterId, [["Fighter", 1]], undefined, { feats: plan.feats });
    const toughness = ctx.featMap["Toughness"];
    expect(pickSteps(previewed).feats.fitted[ctx.aptMap["General"]]).toEqual([toughness, toughness]);
    const level = await levelUp(session, ctx, characterId, "Fighter", 1, plan);
    expect(await savedFeatNames(ctx, [level.id])).toEqual(["Dodge", "Toughness", "Toughness"]);
  });

  test("keeps a feat a level holds from before the rule: each level edits as it reads, a new pick refused", async () => {
    const { ctx, characterId, first, resave } = await setupFighter();
    const [general, bonus] = [ctx.aptMap["General"], ctx.aptMap["Fighter Bonus Feat"]];
    // Modifiers made after the first level was saved give the character its Improved Initiative, and Iron Will
    await possess(characterId, ["improvedinitiative", "ironwill"]);
    await resaveAsRead(characterId, first.id);
    // Its step keeps its own Improved Initiative, and drops Iron Will, as its save refuses it
    const picked = {
      [general]: [ctx.featMap["Power Attack"], ctx.featMap["Iron Will"]],
      [bonus]: [ctx.featMap["Improved Initiative"]],
    };
    const answer = await editAnswer(characterId, first.id, { feats: picked });
    expect(pickSteps(answer).feats.fitted).toEqual({
      [general]: [ctx.featMap["Power Attack"]],
      [bonus]: [ctx.featMap["Improved Initiative"]],
    });
    const ironWill = { General: ["Power Attack", "Iron Will"], "Fighter Bonus Feat": ["Improved Initiative"] };
    expect(resave({ feats: ironWill }, true)).rejects.toMatchObject(alreadyHeld("Iron Will"));

    // Track, picked at a fighter's first level before a ranger's granted it
    const trackerId = await createSeedCharacter(ctx, "fighter", { xp: 1000 });
    const tracker = { ...FIGHTER_LEVELS[0], feats: { ...FIGHTER_LEVELS[0].feats, General: ["Power Attack", "Track"] } };
    const tracking = await levelUp(session, ctx, trackerId, "Fighter", 1, tracker);
    const ranger = { hp: 8, skills: { Spot: 4, Survival: 4 }, feats: { "Favored Enemy": ["Favored Enemy: Undead"] } };
    await levelUp(session, ctx, trackerId, "Ranger", 1, ranger);
    await resaveAsRead(trackerId, tracking.id);
  });
});

describe("a pick the level's other picks give", () => {
  const KNOWN_LIGHT = { message: 'Spell "Light" is already known in Sorcerer Spells', refusal: "invalid" };
  const FOCUS = "Weapon Focus: Longsword";
  const WAR_WEAPON = "War Domain Weapon: Longsword";

  test("drops a feat another feat picked at the level gives, whatever their order, as the picker leaves it out and the save refuses it, forced or not", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx, "cleric");
    const [general, weapon] = [ctx.aptMap["General"], ctx.aptMap["War Domain Weapon"]];
    // Its General picker leaves Weapon Focus out once the war weapon is picked, which its own picker offers with
    // Weapon Focus picked
    expect(await offeredFeats(characterId, "Cleric", 1, "General", FOCUS)).toContain(FOCUS);
    const weaponPicked = { feats: { [weapon]: [ctx.featMap[WAR_WEAPON]] } };
    expect(await offeredFeats(characterId, "Cleric", 1, "General", FOCUS, weaponPicked)).not.toContain(FOCUS);
    const focusPicked = { feats: { [general]: [ctx.featMap[FOCUS]] } };
    expect(await offeredFeats(characterId, "Cleric", 1, "War Domain Weapon", WAR_WEAPON, focusPicked)).toEqual([
      WAR_WEAPON,
    ]);

    // Picked first or last, Weapon Focus gives way: its slot goes to the next General feat, the war weapon stays
    const orders: [string[], "General" | "War Domain Weapon"][] = [
      [[FOCUS, "Toughness", "Great Fortitude"], "General"],
      [["Toughness", "Great Fortitude", FOCUS], "War Domain Weapon"],
    ];
    for (const [generalFeats, first] of orders) {
      const { feats } = warClericFirst(generalFeats, first);
      const previewed = await preview(ctx, characterId, [["Cleric", 1]], undefined, { feats });
      expect(pickSteps(previewed).feats.fitted[general]).toEqual([
        ctx.featMap["Toughness"],
        ctx.featMap["Great Fortitude"],
      ]);
      expect(pickSteps(previewed).feats.fitted[weapon]).toEqual([ctx.featMap[WAR_WEAPON]]);
      const plan = warClericFirst(
        generalFeats.slice(0, 2).includes(FOCUS) ? [FOCUS, "Toughness"] : ["Toughness", FOCUS],
        first,
      );
      for (const force of [false, true])
        expect(levelUp(session, ctx, characterId, "Cleric", 1, plan, force)).rejects.toMatchObject(alreadyHeld(FOCUS));
    }
    const level = await levelUp(
      session,
      ctx,
      characterId,
      "Cleric",
      1,
      warClericFirst(["Toughness", "Great Fortitude"]),
    );
    expect(await savedFeatNames(ctx, [level.id])).toEqual(
      ["Good Domain", "Great Fortitude", "Toughness", "War Domain", WAR_WEAPON].sort(),
    );
  });

  test("drops a spell another spell picked at the level makes known in its list, whatever their order, as the picker leaves it out and the save refuses it, forced or not", async () => {
    const { characterId, ctx } = await createLightGivingSorcerer();
    const sorcererSpells = ctx.aptMap["Sorcerer Spells"];
    const pickOf = (name: string) => ({ [sorcererSpells]: [ctx.spellMap[name]] });
    // Its picker leaves Light out once Detect Magic is picked, and offers Detect Magic with Light picked
    expect(await offeredSpells(characterId, "Sorcerer", 1, "Sorcerer Spells", "Light")).toContain("Light");
    const lightOffered = await offeredSpells(
      characterId,
      "Sorcerer",
      1,
      "Sorcerer Spells",
      "Light",
      pickOf("Detect Magic"),
    );
    expect(lightOffered).not.toContain("Light");
    const detectOffered = await offeredSpells(
      characterId,
      "Sorcerer",
      1,
      "Sorcerer Spells",
      "Detect Magic",
      pickOf("Light"),
    );
    expect(detectOffered).toEqual(["Detect Magic"]);

    // Picked first or last, Light gives way: its slot goes to the next cantrip, Detect Magic stays
    const kept = ["Detect Magic", "Read Magic", "Mage Hand", "Resistance", "Magic Missile", "Shield"];
    for (const picks of [
      ["Light", ...kept],
      [...kept, "Light"],
    ]) {
      const spells = { "Sorcerer Spells": picks };
      const previewed = await preview(ctx, characterId, [["Sorcerer", 1]], undefined, { spells });
      expect(pickSteps(previewed).spells.fitted[sorcererSpells]).toEqual(kept.map((name) => ctx.spellMap[name]));
      const plan = { ...SORCERER_1, spells: { "Sorcerer Spells": picks.filter((name) => name !== "Resistance") } };
      for (const force of [false, true])
        expect(levelUp(session, ctx, characterId, "Sorcerer", 1, plan, force)).rejects.toMatchObject(KNOWN_LIGHT);
    }
    const level = await levelUp(session, ctx, characterId, "Sorcerer", 1, {
      ...SORCERER_1,
      spells: { "Sorcerer Spells": kept },
    });
    const saved = await findPicks("spells", [level.id]);
    expect(saved.map(({ entityId }) => entityId).sort()).toEqual(kept.map((name) => ctx.spellMap[name]).sort());
  });

  test("drops a feat a spell picked at the level gives, as the feat picker leaves it out and the save refuses it", async () => {
    const { characterId, ctx } = await createLightGivingSorcerer();
    await give("spells", ctx.spellMap["Detect Magic"], "feats.ironwill.possessed");
    const detectMagic = { [ctx.aptMap["Sorcerer Spells"]]: [ctx.spellMap["Detect Magic"]] };
    expect(await offeredFeats(characterId, "Sorcerer", 1, "General", "Iron Will")).toEqual(["Iron Will"]);
    const detectPicked = { spells: detectMagic };
    expect(await offeredFeats(characterId, "Sorcerer", 1, "General", "Iron Will", detectPicked)).toEqual([]);

    const plan = { ...SORCERER_1, feats: { ...SORCERER_1.feats, General: ["Toughness", "Iron Will"] } };
    const previewed = await preview(ctx, characterId, [["Sorcerer", 1]], undefined, plan);
    expect(pickSteps(previewed).feats.fitted[ctx.aptMap["General"]]).toEqual([ctx.featMap["Toughness"]]);
    for (const force of [false, true]) {
      expect(levelUp(session, ctx, characterId, "Sorcerer", 1, plan, force)).rejects.toMatchObject(
        alreadyHeld("Iron Will"),
      );
    }
  });

  test("drops a feat one planned level picks that another's pick gives, as the save refuses it, forced or not", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx, "fighter", { xp: 1000 });
    // A fighter's first level, whose bonus feat is Weapon Focus: Longsword, then a cleric's, whose war weapon gives it
    const plan = {
      skills: { ...FIGHTER_LEVELS[0].skills, Concentration: 1, Heal: 1, Spellcraft: 1, Diplomacy: 1 },
      feats: { ...WAR_CLERIC_1.feats, General: ["Power Attack", "Great Fortitude"], "Fighter Bonus Feat": [FOCUS] },
    };
    const levels: [string, number][] = [
      ["Fighter", 1],
      ["Cleric", 1],
    ];
    const previewed = await preview(ctx, characterId, levels, undefined, { feats: plan.feats });
    expect(pickSteps(previewed).feats.fitted[ctx.aptMap["Fighter Bonus Feat"]]).toEqual([]);
    expect(pickSteps(previewed).feats.fitted[ctx.aptMap["War Domain Weapon"]]).toEqual([ctx.featMap[WAR_WEAPON]]);
    const batch: BatchLevel[] = [
      ["Fighter", 1, 10],
      ["Cleric", 1, 8],
    ];
    for (const force of [false, true])
      expect(finalizeBatch(ctx, characterId, batch, plan, force)).rejects.toMatchObject(alreadyHeld(FOCUS));
  });

  test("keeps the pick whose name comes first of two that each give the other, whatever their order", async () => {
    const ctx = await getSeedCtx();
    // A fork whose Great Fortitude gives Iron Will, and Iron Will Great Fortitude
    const fork = await createSeededTestRuleset(SEED_USER_ID);
    const fortitude = await copyEntity(db, "feats", ctx.featMap["Great Fortitude"], fork);
    const will = await copyEntity(db, "feats", ctx.featMap["Iron Will"], fork);
    await give("feats", fortitude.id, "feats.ironwill.possessed");
    await give("feats", will.id, "feats.greatfortitude.possessed");
    RulesetViews.invalidate(fork.id);
    const forkCtx = { ...ctx, featMap: { ...ctx.featMap, "Great Fortitude": fortitude.id, "Iron Will": will.id } };
    const characterId = await createSeedCharacter(ctx, "fighter", { rulesetId: fork.id });
    const general = ctx.aptMap["General"];
    // Each picked leaves the other out of the picker
    const picked = (feat: { id: string }) => ({ feats: { [general]: [feat.id] } });
    expect(await offeredFeats(characterId, "Fighter", 1, "General", "Iron Will", picked(fortitude))).toEqual([]);
    expect(await offeredFeats(characterId, "Fighter", 1, "General", "Great Fortitude", picked(will))).toEqual([]);

    // Picked together, in either order: Great Fortitude stays, Iron Will gives way
    for (const both of [
      ["Great Fortitude", "Iron Will"],
      ["Iron Will", "Great Fortitude"],
    ]) {
      const plan = { ...FIGHTER_LEVELS[0], feats: { ...FIGHTER_LEVELS[0].feats, General: both } };
      const previewed = await preview(forkCtx, characterId, [["Fighter", 1]], undefined, { feats: plan.feats });
      expect(pickSteps(previewed).feats.fitted[general]).toEqual([fortitude.id]);
      for (const force of [false, true]) {
        expect(levelUp(session, forkCtx, characterId, "Fighter", 1, plan, force)).rejects.toMatchObject(
          alreadyHeld("Iron Will"),
        );
      }
    }
  });

  test("keeps a feat a level saved before the rule beside the pick that gives it: it edits as it reads, a new gift refused", async () => {
    const ctx = await getSeedCtx();
    const [general, weapon] = [ctx.aptMap["General"], ctx.aptMap["War Domain Weapon"]];
    const proficiency = "Martial Weapon Proficiency: Longsword";
    // A cleric level that picks the longsword's proficiency, which its war weapon gives: written straight to the database
    const characterId = await createSeedCharacter(ctx, "cleric");
    const { feats, skills } = picks(ctx, warClericFirst(["Toughness", proficiency]));
    const level = await addCharacterLevel(characterId, (await findClassLevel(ctx.classMap.pc["Cleric"], 1))!.id, {
      feats,
      skills,
    });
    await resaveAsRead(characterId, level.id);

    // Its step keeps its own proficiency, and drops Weapon Focus, which the war weapon gives too, as its save refuses it
    const focused = picks(ctx, warClericFirst([proficiency, FOCUS]));
    const step = pickSteps(await editAnswer(characterId, level.id, { feats: focused.feats })).feats;
    expect(step.fitted[general]).toEqual([ctx.featMap[proficiency]]);
    expect(step.fitted[weapon]).toEqual([ctx.featMap[WAR_WEAPON]]);
    for (const force of [false, true]) {
      const plan = levelEditPlan({ hp: 8 }, { skills, feats: focused.feats });
      const edit = CharacterLevelsService.updatePlannedLevel(session, characterId, level.id, plan, force);
      expect(edit).rejects.toMatchObject(alreadyHeld(FOCUS));
    }
  });

  test("keeps a spell a level saved before the rule beside the pick that makes it known: it edits as it reads, a new gift refused", async () => {
    const { characterId, ctx, rulesetId } = await createLightGivingSorcerer();
    const sorcererSpells = ctx.aptMap["Sorcerer Spells"];
    const spellPicks = (names: string[]) => ({ [sorcererSpells]: names.map((name) => ctx.spellMap[name]) });
    // A sorcerer level that picks Light, which its Detect Magic makes known: written straight to the database
    const { feats, spells, skills } = picks(ctx, SORCERER_1);
    const level = await addCharacterLevel(characterId, (await findClassLevel(ctx.classMap.pc["Sorcerer"], 1))!.id, {
      feats,
      spells: { [sorcererSpells]: spells[sorcererSpells] },
      skills,
    });
    await resaveAsRead(characterId, level.id);
    const lightKept = await editAnswer(characterId, level.id, {
      spells: spellPicks(SORCERER_1.spells!["Sorcerer Spells"]),
    });
    expect(pickSteps(lightKept).spells.fitted[sorcererSpells]).toEqual(spells[sorcererSpells]);

    // A level saved without Light: its edit that picks it is refused, and its step drops it
    const otherId = await createSeedCharacter(ctx, "sorcerer", { rulesetId, xp: 1000 });
    const kept = ["Detect Magic", "Read Magic", "Mage Hand", "Resistance", "Magic Missile", "Shield"];
    const saved = await levelUp(session, ctx, otherId, "Sorcerer", 1, {
      ...SORCERER_1,
      spells: { "Sorcerer Spells": kept },
    });
    const withLight = kept.map((name) => (name === "Resistance" ? "Light" : name));
    const step = pickSteps(await editAnswer(otherId, saved.id, { spells: spellPicks(withLight) })).spells;
    expect(step.fitted[sorcererSpells]).toEqual(
      withLight.filter((name) => name !== "Light").map((name) => ctx.spellMap[name]),
    );
    const lightPicks = picks(ctx, { ...SORCERER_1, spells: { "Sorcerer Spells": withLight } });
    for (const force of [false, true]) {
      const edit = CharacterLevelsService.updatePlannedLevel(
        session,
        otherId,
        saved.id,
        levelEditPlan({ hp: 4 }, lightPicks),
        force,
      );
      expect(edit).rejects.toMatchObject(KNOWN_LIGHT);
    }
  });
});

describe("a pick sent by the id of what the fork copied", () => {
  // The seed's ids are the sources': the API takes them, as it takes the copies' the client sends
  test("previews, saves and edits a spell picked by its source's id at its spell level: the copy's row", async () => {
    const ctx = await getSeedCtx();
    const fork = await createSeededTestRuleset(SEED_USER_ID);
    const name = "Magic Missile";
    const copy = await EntitiesService.updateEntity(session, fork.id, "spells", ctx.spellMap[name], {
      name,
      description: "Copied",
    });
    const forkCtx: SeedContext = { ...ctx, spellMap: { ...ctx.spellMap, [name]: copy.id } };
    const known = SORCERER_1.spells!["Sorcerer Spells"].map((spell) => forkCtx.spellMap[spell]);
    const savedSpells = async (levelId: string) =>
      (await findPicks("spells", [levelId])).map(({ entityId }) => entityId).sort();

    // Magic Missile is a first-level spell, in the first level's room for two
    const characterId = await createSeedCharacter(ctx, "sorcerer", { rulesetId: fork.id });
    const previewed = await preview(ctx, characterId, [["Sorcerer", 1]], undefined, { spells: SORCERER_1.spells });
    expect(pickSteps(previewed).spells.fitted[ctx.aptMap["Sorcerer Spells"]]).toEqual(known);
    const level = await levelUp(session, ctx, characterId, "Sorcerer", 1, SORCERER_1);
    expect(await savedSpells(level.id)).toEqual(known.toSorted());

    // A level saved with the copy's id, edited with the source's
    const editedId = await createSeedCharacter(ctx, "sorcerer", { rulesetId: fork.id });
    const saved = await levelUp(session, forkCtx, editedId, "Sorcerer", 1, SORCERER_1);
    const { feats, spells, skills } = picks(ctx, SORCERER_1);
    await CharacterLevelsService.updatePlannedLevel(
      session,
      editedId,
      saved.id,
      levelEditPlan({ hp: 4 }, { skills, feats, spells }),
    );
    expect(await savedSpells(saved.id)).toEqual(known.toSorted());
  });

  test("saves a feat picked by its source's id as the copy, and refuses it again by either id, as the preview drops it", async () => {
    const ctx = await getSeedCtx();
    const fork = await createSeededTestRuleset(SEED_USER_ID);
    const name = "Power Attack";
    const copy = await EntitiesService.updateEntity(session, fork.id, "feats", ctx.featMap[name], {
      name,
      description: "Copied",
    });
    const characterId = await createSeedCharacter(ctx, "fighter", { rulesetId: fork.id, xp: 1000 });
    const first = await levelUp(session, ctx, characterId, "Fighter", 1, FIGHTER_LEVELS[0]);
    const rows = await findPicks("feats", [first.id]);
    expect(rows.map(({ entityId }) => entityId)).toContain(copy.id);
    expect(rows.map(({ entityId }) => entityId)).not.toContain(ctx.featMap[name]);

    // The second level picks it again by its source's id: dropped from the preview, and refused, forced or not
    const again = { ...FIGHTER_LEVELS[1], feats: { "Fighter Bonus Feat": [name] } };
    const previewed = await preview(ctx, characterId, [["Fighter", 2]], undefined, { feats: again.feats });
    expect(pickSteps(previewed).feats.fitted[ctx.aptMap["Fighter Bonus Feat"]]).toEqual([]);
    for (const force of [false, true])
      expect(levelUp(session, ctx, characterId, "Fighter", 2, again, force)).rejects.toMatchObject(alreadyHeld(name));

    // Its edit, once saved with another feat
    const second = await levelUp(session, ctx, characterId, "Fighter", 2, FIGHTER_LEVELS[1]);
    const { feats, skills } = picks(ctx, again);
    for (const force of [false, true]) {
      const plan = levelEditPlan({ hp: 8 }, { skills, feats });
      const edit = CharacterLevelsService.updatePlannedLevel(session, characterId, second.id, plan, force);
      expect(edit).rejects.toMatchObject(alreadyHeld(name));
    }

    // A level that picks it by both ids
    const bothIds = { [ctx.aptMap["General"]]: [ctx.featMap[name], copy.id] };
    const otherId = await createSeedCharacter(ctx, "fighter", { rulesetId: fork.id });
    const levels = [{ classId: ctx.classMap.pc["Fighter"], level: 1, hp: 10, abilityIncreases: [] }];
    const twice = { message: `Non-stackable feat "${name}" cannot be picked more than once`, refusal: "invalid" };
    const levelUpBoth = CharacterLevelsService.addLevels(
      session,
      otherId,
      levelUpPlan(levels, { skills, feats: bothIds }),
    );
    expect(levelUpBoth).rejects.toMatchObject(twice);
  });

  test("previews and saves a skill and a spell list picked by their sources' ids as their copies", async () => {
    const ctx = await getSeedCtx();
    const fork = await createSeededTestRuleset(SEED_USER_ID);
    const climb = await copyEntity(db, "skills", ctx.skillMap["Climb"], fork);
    const sorcererSpells = await copyEntity(db, "aptitudes", ctx.aptMap["Sorcerer Spells"], fork);
    RulesetViews.invalidate(fork.id);

    // Climb, a fighter's class skill, at 4 ranks of its 6 points, as the seed's Climb is
    const fighterId = await createSeedCharacter(ctx, "fighter", { rulesetId: fork.id });
    const answer = await preview(ctx, fighterId, fighter(1), [null], { skills: { Climb: 6 } });
    expect(stepAnswerOf(answer, "skills", "spend").rows.find(({ id }) => id === climb.id)).toMatchObject({
      favored: true,
      points: 4,
      value: 4,
    });
    const fighterLevel = await levelUp(session, ctx, fighterId, "Fighter", 1, FIGHTER_LEVELS[0]);
    const ranks = await findPicks("skills", [fighterLevel.id]);
    expect(ranks.find(({ entityId }) => entityId === climb.id)).toMatchObject({ amount: 4 });

    // The sorcerer's spells, each known in the copy of the list
    const sorcererId = await createSeedCharacter(ctx, "sorcerer", { rulesetId: fork.id });
    const sorcererLevel = await levelUp(session, ctx, sorcererId, "Sorcerer", 1, SORCERER_1);
    const spells = await findPicks("spells", [sorcererLevel.id]);
    expect(new Set(spells.map(({ viaId }) => viaId))).toEqual(new Set([sorcererSpells.id]));
  });
});

describe("a character's last level", () => {
  test("refuses a plan past it, whatever its classes, forced or not, and previews one up to it", async () => {
    const ctx = await getSeedCtx();
    // Two levels left: a plan's third, of another class, goes past 20
    const characterId = await createFighterAt(ctx, 18);
    for (const force of [false, true]) {
      expect(finalizeBatch(ctx, characterId, levelsOf("Rogue", [6, 6, 6]), {}, force)).rejects.toMatchObject(
        pastLastLevel(2),
      );
    }
    const threeRogueLevels: [string, number][] = [
      ["Rogue", 1],
      ["Rogue", 2],
      ["Rogue", 3],
    ];
    expect(preview(ctx, characterId, threeRogueLevels)).rejects.toMatchObject(pastLastLevel(2));
    expect(
      (
        await preview(ctx, characterId, [
          ["Rogue", 1],
          ["Fighter", 19],
        ])
      ).advancements,
    ).toHaveLength(2);
  });

  test("leaves a character at it no level to take, as the class picker says", async () => {
    const ctx = await getSeedCtx();
    const levelsLeft = async (characterId: string) => {
      // Add Level's class plan, before it plans a level
      const options = await getStepOptions(session, characterId, "class-plan", { steps: {} }, {}, { limit: 20 });
      if (options.grouped) throw new Error("Expected the classes ungrouped");
      return new Set(options.items.map((klass) => klass.track?.left));
    };
    const atLast = await createFighterAt(ctx, 20);
    expect(await levelsLeft(atLast)).toEqual(new Set([0]));
    expect(finalizeBatch(ctx, atLast, levelsOf("Rogue", [6]), {}, true)).rejects.toMatchObject(pastLastLevel(0));
    expect(await levelsLeft(await createFighterAt(ctx, 18))).toEqual(new Set([2]));
  });
});

describe("a character's level in a class", () => {
  test("counts its levels of the class, on its sheet, its card and in the class picker, when a forced level skips some", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx, "fighter", { xp: 1000 });
    const fighterId = ctx.classMap.pc["Fighter"];
    // Its first level, forced as Fighter 3, which gives no bonus feat: one level of the class, Fighter 3's
    const [{ hp, skills }] = FIGHTER_LEVELS;
    const feats = { General: ["Power Attack", "Great Fortitude"] };
    await finalizeBatch(ctx, characterId, [["Fighter", 3, hp]], { skills, feats }, true);
    const { name, summary } = await CharactersService.getCharacter(session, characterId);
    const { items } = await CharactersService.getCharacters(session, { search: name }, { limit: 10, page: 1 });
    const card = items.find(({ id }) => id === characterId);
    const options = await getStepOptions(session, characterId, "class-plan", { steps: {} }, {}, { limit: 50 });
    if (options.grouped) throw new Error("Expected the classes ungrouped");
    const fighter = options.items.find(({ id }) => id === fighterId);
    expect({
      sheet: summary.tracks.map(({ label }) => label),
      card: card?.chips.filter(({ tone }) => tone === "primary").map(({ label }) => label),
      // The next level's own requirement, a fighter level past the one before, reads the count too
      picker: { next: fighter?.track?.next, eligible: fighter?.eligible },
    }).toEqual({ sheet: ["Fighter 1"], card: ["Fighter 1"], picker: { next: 2, eligible: true } });
  });
});

describe("re-saving a level", () => {
  test("refuses ranks above the level's cap, and a pool left unspent", async () => {
    const { resave } = await setupFighter();
    expect(resave({ skills: { Climb: 8, Intimidate: 4, Jump: 4 } })).rejects.toThrow("rank");
    expect(
      resave({ feats: { General: ["Power Attack", "Great Fortitude"], "Fighter Bonus Feat": [] } }),
    ).rejects.toThrow(/Fighter Bonus Feat.*unspent/);
  });

  test("refuses a pool that a feat picked at the level opens, left unspent", async () => {
    // Regression: only granted feats' pools were checked, so a specialization's prohibited schools could be left empty.
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx, "wizard", {
      race: "Human",
      languages: ["Common"],
      abilities: { Intelligence: 16, Constitution: 14 },
    });
    const plan: LevelPlan = {
      hp: 4,
      skills: {
        Spellcraft: 4,
        Concentration: 4,
        "Knowledge (Arcana)": 4,
        "Decipher Script": 4,
        "Knowledge (Religion)": 4,
        "Knowledge (Nature)": 4,
      },
      feats: {
        General: ["Toughness", "Great Fortitude"],
        "Wizard Specialization": ["Evocation Specialist"],
        "Prohibited School": ["Prohibit Illusion", "Prohibit Necromancy"],
        "Familiar Bond": ["Cat Familiar"],
      },
      spells: {
        "Wizard Spells": [
          "Detect Magic",
          "Read Magic",
          "Mage Hand",
          "Light",
          "Ray of Frost",
          "Resistance",
          "Magic Missile",
          "Shield",
          "Mage Armor",
        ],
      },
    };
    const level = await levelUp(session, ctx, characterId, "Wizard", 1, plan);
    const { skills, feats, spells } = picks(ctx, { ...plan, feats: { ...plan.feats, "Prohibited School": [] } });
    const edit = levelEditPlan({ hp: 4 }, { skills, feats, spells });
    expect(CharacterLevelsService.updatePlannedLevel(session, characterId, level.id, edit)).rejects.toThrow(
      /Prohibited School.*unspent/,
    );
  });

  describe("an ability increase", () => {
    test("is refused at a level that doesn't grant one, even forced", async () => {
      const { ctx, resave } = await setupFighter();
      for (const force of [false, true]) {
        expect(resave({ entityId: ctx.abilityMap["Strength"] }, force)).rejects.toThrow(
          "Ability increase is not available at this level",
        );
      }
    });

    test("saved there before the check existed is refused again, and can be cleared", async () => {
      const { ctx, first, resave } = await setupFighter();
      await Picks.createMany(db, [
        { advancementId: first.id, step: "abilities", entityId: ctx.abilityMap["Strength"], amount: 1 },
      ]);
      // The edit dialog sends the stored increase back.
      expect(resave({ entityId: ctx.abilityMap["Strength"] })).rejects.toThrow(
        "Ability increase is not available at this level",
      );
      await resave({ entityId: null });
      expect(await findPicks("abilities", [first.id])).toEqual([]);
    });

    test("at a level that grants one raises one ability by 1, read back with the level", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "fighter", { xp: 6000 });
      const [strength, dexterity] = [ctx.abilityMap["Strength"], ctx.abilityMap["Dexterity"]];
      const save = (increases: PlannedClassLevel["abilityIncreases"]) =>
        CharacterLevelsService.addLevels(
          session,
          characterId,
          levelUpPlan(
            [1, 2, 3, 4].map((level) => ({
              abilityIncreases: level === 4 ? increases : [],
              hp: 6,
              classId: ctx.classMap.pc["Fighter"],
              level,
            })),
          ),
          true,
        );
      expect(save([{ entityId: strength, amount: 2 }])).rejects.toThrow(
        "Level 4: Ability increases must add up to 1 at this level",
      );
      expect(
        save([
          { entityId: strength, amount: 1 },
          { entityId: dexterity, amount: 1 },
        ]),
      ).rejects.toThrow("Level 4: Ability increases must add up to 1 at this level");
      expect(
        save([
          { entityId: strength, amount: 1 },
          { entityId: strength, amount: 1 },
        ]),
      ).rejects.toThrow("Level 4: An ability is increased twice at this level");

      const saved = await save([{ entityId: strength, amount: 1 }]);
      const level = await savedLevel(characterId, saved[3].id);
      expect(level.abilityIncreases).toEqual([{ entityId: strength, amount: 1 }]);
    });
  });
});
