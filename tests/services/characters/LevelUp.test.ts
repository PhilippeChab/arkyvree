import { describe, expect, test } from "bun:test";

import { levelAbilityIncreasesInCharacter } from "@/drizzle/schema.ts";
import type { AbilityIncrease, PlannedSoFar } from "@/engine/index.ts";
import { type SeedContext } from "@/scripts/db/seeds/seedContext.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import {
  CharacterLevelAbilityIncreases,
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevelSkills,
  Characters,
  FeatsAptitudes,
  Modifiers,
} from "@/server/repositories/index.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";
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
import { addCharacterLevel, findKlassLevel, getLevelStep, increasesOf } from "@/tests/support/levels.ts";
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
  const { skills, feats, powers } = picks(ctx, plan);
  const batch = levels.map(([klass, level, hp, ability]) => ({
    klassId: ctx.klassMap.pc[klass],
    level,
    hp,
    abilityIncreases: increasesOf(ability && ctx.abilityMap[ability]),
  }));
  return CharacterLevelsService.finalizeLevelUp(session, characterId, batch, skills, feats, powers, force);
}

function levelsOf(klass: string, hps: number[]): BatchLevel[] {
  return hps.map((hp, index) => [klass, index + 1, hp]);
}

/** The refusal of a plan past a character's last level, with the levels it has left. */
function pastLastLevel(levelsLeft: number) {
  const message = `A character can't go past level 20: ${levelsLeft} level(s) left`;
  return { refusal: "invalid", issues: [{ category: "levels", message }] };
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
    await addCharacterLevel(characterId, (await findKlassLevel(ctx.klassMap.pc["Fighter"], level))!.id);
  return characterId;
}

/**
 * A fork whose Detect Magic makes Light known on the sorcerer's list (`rulesetId`), and a human sorcerer of it
 * (`characterId`): the seed's context with the fork's Detect Magic, its copy, which the pickers list (`ctx`).
 */
async function createLightGivingSorcerer() {
  const ctx = await getSeedCtx();
  const fork = await createSeededTestRuleset(SEED_USER_ID);
  const detectMagic = await copyEntity(db, "powers", ctx.powerMap["Detect Magic"], fork);
  await give("powers", detectMagic.id, "powers.light.sorcerer.known");
  RulesetViews.invalidate(fork.id);
  const characterId = await createSeedCharacter(ctx, "sorcerer", { rulesetId: fork.id, xp: 1000 });
  const forkCtx: SeedContext = { ...ctx, powerMap: { ...ctx.powerMap, "Detect Magic": detectMagic.id } };
  return { characterId, ctx: forkCtx, rulesetId: fork.id };
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
  const plan = Array.from({ length: level }, (_, i) => ({
    abilityIncreases: [],
    klassId: ctx.klassMap.pc["Fighter"],
    level: i + 1,
  }));
  const { levelDetails } = await CharacterLevelsService.getPreview(session, characterId, plan, {}, {}, {});
  const featPicks = (options.pendingPicks ?? []).map((name) => ({
    featId: ctx.featMap[name],
    aptitudeId: ctx.aptMap["General"],
  }));
  const { items } = await CharacterLevelsService.getAvailableFeatGroups(
    session,
    characterId,
    {
      aptitudeId: ctx.aptMap["General"],
      classId: ctx.klassMap.pc["Fighter"],
      level: level,
      plannedClassLevelIds: levelDetails.slice(0, level - 1).map((d) => d.klassLevelId),
      plannedAbilityIncreases: options.increases?.slice(0, level - 1).map(increasesOf),
      abilityIncreases: increasesOf(options.increases?.[level - 1]),
      search,
      featPicks,
    },
    { limit: 20, page: 1 },
  );
  return items.find((row) => row.displayName === search)!.eligible;
}

/** Gives a row (`sourceType`'s `sourceId`) a modifier that gives what `target` names, a feat or a spell on a list. */
async function give(sourceType: string, sourceId: string, target: string) {
  await Modifiers.create(db, { sourceId, sourceType, target, value: "true", valueType: "boolean", operator: "set" });
}

/**
 * The names of the feats Add Level's picker offers at a class's `level`, in pool `aptitude`, searched by `search`, with
 * the feats and spells `picked` so far.
 */
async function offeredFeats(
  characterId: string,
  klass: string,
  level: number,
  aptitude: string,
  search: string,
  picked: Pick<PlannedSoFar, "featPicks" | "powerPicks"> = {},
) {
  const ctx = await getSeedCtx();
  const { items } = await CharacterLevelsService.getAvailableFeats(
    session,
    characterId,
    { aptitudeId: ctx.aptMap[aptitude], classId: ctx.klassMap.pc[klass], level, search, ...picked },
    { limit: 20, page: 1 },
  );
  return items.map(({ name }) => name);
}

/**
 * The names of the spells Add Level's picker offers at a class's `level`, in pool `aptitude`, searched by `search`, with
 * the spells picked so far (`powerPicks`).
 */
async function offeredPowers(
  characterId: string,
  klass: string,
  level: number,
  aptitude: string,
  search: string,
  powerPicks: PlannedSoFar["powerPicks"] = [],
) {
  const ctx = await getSeedCtx();
  const { items } = await CharacterLevelsService.getAvailablePowers(
    session,
    characterId,
    { aptitudeId: ctx.aptMap[aptitude], classId: ctx.klassMap.pc[klass], level, search, powerPicks },
    { limit: 20, page: 1 },
  );
  return items.map(({ name }) => name);
}

/** Gives the character the feats of these `slugs` by modifiers of its own (`set feats.<slug>.possessed`), as a race would. */
async function possess(characterId: string, slugs: string[]) {
  for (const slug of slugs) await give("characters", characterId, `feats.${slug}.possessed`);
}

async function preview(
  ctx: SeedContext,
  characterId: string,
  levels: [string, number][],
  abilities: (string | null)[] = levels.map(() => null),
  plan: Omit<LevelPlan, "ability" | "hp"> = {},
) {
  const { feats, powers, skills } = picks(ctx, plan);
  return CharacterLevelsService.getPreview(
    session,
    characterId,
    levels.map(([klass, level], i) => ({
      abilityIncreases: increasesOf(abilities[i]),
      klassId: ctx.klassMap.pc[klass],
      level,
    })),
    skills,
    feats,
    powers,
  );
}

/**
 * Saves a saved level's edit as the level reads it (`getLevel`): its hit points, ability increases and picks, its powers
 * those of `powers` when given.
 */
async function resaveAsRead(characterId: string, levelId: string, powers?: Record<string, string[]>) {
  const level = await CharacterLevelsService.getLevel(session, characterId, levelId);
  const idsOf = (picked: Record<string, { id: string }[]>) =>
    Object.fromEntries(Object.entries(picked).map(([aptitudeId, rows]) => [aptitudeId, rows.map(({ id }) => id)]));
  const { abilityIncreases, feats, hp, skills } = level;
  return CharacterLevelsService.updateLevel(
    session,
    characterId,
    levelId,
    hp,
    abilityIncreases,
    skills,
    idsOf(feats),
    powers ?? idsOf(level.powers),
  );
}

/** The names of the feats a character's levels saved, a row each, sorted. */
async function savedFeatNames(ctx: SeedContext, levelIds: string[]) {
  const names = new Map(Object.entries(ctx.featMap).map(([name, id]) => [id, name]));
  const rows = await CharacterLevelFeats.findMany(db, { characterLevelIds: levelIds });
  return rows.map(({ featId }) => names.get(featId)).sort();
}

/** A fighter's first two levels, and the plan the first was saved with. */
async function setupFighter() {
  const ctx = await getSeedCtx();
  const characterId = await createSeedCharacter(ctx, "fighter", { xp: 1000 });
  const first = await levelUp(session, ctx, characterId, "Fighter", 1, FIGHTER_LEVELS[0]);
  await levelUp(session, ctx, characterId, "Fighter", 2, FIGHTER_LEVELS[1]);
  const resave = (plan: Partial<LevelPlan> & { abilityId?: string | null }, force = false) => {
    const { skills, feats, powers } = picks(ctx, { ...FIGHTER_LEVELS[0], ...plan });
    return CharacterLevelsService.updateLevel(
      session,
      characterId,
      first.id,
      10,
      increasesOf(plan.abilityId),
      skills,
      feats,
      powers,
      force,
    );
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
        powers: {
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
        raceName: "Elf",
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
      values: { raceName: "Human", languages: ["Common"], abilities: { Intelligence: 16, Constitution: 14 } },
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
        powers: WIZARD_SPELLS,
      },
    },
    {
      name: "a fighter level, then a wizard level that gives up schools",
      build: "wizard",
      values: {
        xp: 3000,
        raceName: "Human",
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
        powers: WIZARD_SPELLS,
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
    const { feats, powers } = picks(ctx, plan);
    expect(
      (await CharacterLevelFeats.findMany(db, { characterLevelIds: levelIds })).map((f) => f.featId).sort(),
    ).toEqual(Object.values(feats).flat().sort());
    expect(
      (await CharacterLevelPowers.findMany(db, { characterLevelIds: levelIds })).map((p) => p.powerId).sort(),
    ).toEqual(Object.values(powers).flat().sort());
    const increases = await CharacterLevelAbilityIncreases.findMany(db, { characterLevelIds: levelIds });
    expect(
      created.map((l) =>
        increases
          .filter((row) => row.characterLevelId === l.id)
          .map(({ abilityId, amount }) => ({ abilityId, amount })),
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
    const [atFirst, atSecond] = [
      await CharacterLevelSkills.findMany(db, { characterLevelIds: [first.id] }),
      await CharacterLevelSkills.findMany(db, { characterLevelIds: [second.id] }),
    ];
    expect(atFirst.every((s) => s.rank <= 4)).toBe(true);
    expect(atSecond.length).toBeGreaterThan(0);
    expect([...atFirst, ...atSecond].reduce((sum, s) => sum + s.rank, 0)).toBe(20);
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
    expect(result.feats.fitted[general]).toEqual([ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]]);
    // Its room for the feats picked in it: what it had left, before them
    expect(result.feats.aptitudePools[general]).toMatchObject({ allowed: 2, available: 2, spent: 0 });
  });

  test("grows a pool by a picked feat's room, and drops what's in it with the feat", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx, "wizard");
    const schools = ["Prohibit Illusion", "Prohibit Necromancy"];
    const specialized = { "Wizard Specialization": ["Evocation Specialist"], "Prohibited School": schools };
    const withFeat = await preview(ctx, characterId, [["Wizard", 1]], undefined, { feats: specialized });
    const prohibited = ctx.aptMap["Prohibited School"];
    expect(withFeat.feats.aptitudePools[prohibited]).toMatchObject({ available: 2 });
    expect(withFeat.feats.fitted[prohibited]).toHaveLength(2);
    const without = await preview(ctx, characterId, [["Wizard", 1]], undefined, {
      feats: { "Prohibited School": schools },
    });
    expect(without.feats.fitted[prohibited]).toEqual([]);
  });

  test("answers an edited level's feat step with its room for the picks, and what of them fits", async () => {
    const { ctx, characterId, first } = await setupFighter();
    const general = ctx.aptMap["General"];
    const step = await CharacterLevelsService.getStep(session, characterId, "feats", {
      classId: ctx.klassMap.pc["Fighter"],
      level: 1,
      editedLevelId: first.id,
      featPicks: GENERAL_THREE.map((name) => ({ aptitudeId: general, featId: ctx.featMap[name] })),
    });
    if (step.name !== "feats") throw new Error("Expected the feats step");
    expect(step.fitted[general]).toEqual([ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]]);
    expect(step.aptitudePools[general]).toMatchObject({ available: 2 });
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
      const saved = await CharacterLevelsService.getLevel(session, characterId, level.id);
      expect(saved.feats[general].map(({ id }) => id)).toEqual([ctx.featMap["Toughness"], ctx.featMap["Toughness"]]);
      // 10 rolled, 2 for Constitution 14, and 3 for each Toughness
      expect((await CharactersService.getCharacter(session, characterId)).combat.hp.total).toBe(18);
    }
  });

  test("saves a stacking feat a level picks under two pools", async () => {
    const ctx = await getSeedCtx();
    // A fork whose Toughness is a fighter's bonus feat too
    const fork = await createSeededTestRuleset(SEED_USER_ID);
    const toughness = await copyEntity(db, "feats", ctx.featMap["Toughness"], fork);
    await FeatsAptitudes.create(db, { featId: toughness.id, aptitudeId: ctx.aptMap["Fighter Bonus Feat"] });
    RulesetViews.invalidate(fork.id);
    const characterId = await createSeedCharacter(ctx);
    await Characters.update(db, { rulesetId: fork.id }, { id: characterId });

    const { skills } = picks(ctx, { skills: FIGHTER_1_SKILLS });
    const feats = {
      [ctx.aptMap["General"]]: [toughness.id, ctx.featMap["Power Attack"]],
      [ctx.aptMap["Fighter Bonus Feat"]]: [toughness.id],
    };
    const levels = [{ klassId: ctx.klassMap.pc["Fighter"], level: 1, hp: 10, abilityIncreases: [] }];
    const [level] = await CharacterLevelsService.finalizeLevelUp(session, characterId, levels, skills, feats, {});
    const rows = await CharacterLevelFeats.findMany(db, { characterLevelIds: [level.id] });
    expect(
      rows
        .filter(({ featId }) => featId === toughness.id)
        .map(({ aptitudeId }) => aptitudeId)
        .sort(),
    ).toEqual([ctx.aptMap["General"], ctx.aptMap["Fighter Bonus Feat"]].sort());
  });

  test("refuses a feat that doesn't stack, or a spell, a level picks twice in its pool, forced or not, naming it", async () => {
    const ctx = await getSeedCtx();
    const powerAttackTwice = { General: ["Power Attack", "Power Attack"], "Fighter Bonus Feat": ["Dodge"] };
    const lightTwice = {
      ...SORCERER_1,
      powers: { "Sorcerer Spells": ["Detect Magic", "Light", "Light", "Read Magic"] },
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
        message: 'Power "Light" cannot be picked more than once at a level',
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
      expect(previewed.feats.fitted[ctx.aptMap["General"]]).toEqual(general.map((name) => ctx.featMap[name]));

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

    expect(result.levelDetails).toMatchObject(
      fighter(4).map(([, level]) => ({
        klassId: ctx.klassMap.pc["Fighter"],
        level,
        hd: 10,
        // A d10's: 1 to 10, 5 on average, which the HP step reads
        hitPoints: { average: 5, max: 10, min: 1 },
      })),
    );
    expect(result.perLevelSkillPoints).toEqual([16, 4, 4, 4]);
    expect(result.skills).toMatchObject({ skillPointsToSpend: 28, totalCharacterLevel: 4 });
    expect(result.skills.skills.length).toBeGreaterThan(0);
    // The fourth level of the batch, by its index.
    expect(result.attributes.abilityIncreaseLevels).toEqual([3]);

    await addFighterLevels(session, ctx, characterId, 1);
    // Only a character's first level gets ×4.
    expect((await preview(ctx, characterId, [["Fighter", 2]])).perLevelSkillPoints).toEqual([4]);
    expect(preview(ctx, NIL_UUID, fighter(1))).rejects.toThrow(NotFoundError);
  });

  test("shows the base attributes, raised only by the increases chosen at the levels that take one", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx);
    const intelligence = async (abilities: (string | null)[]) =>
      (await preview(ctx, characterId, fighter(4), abilities)).attributes.attributes["intelligence"];
    expect((await intelligence([null, null, null, null])).total).toBe(12);
    expect(await intelligence([null, null, null, ctx.abilityMap["Intelligence"]])).toMatchObject({
      total: 13,
      modifier: 1,
    });
    // A pick the plan moved off an increase level (the first takes none) raises nothing
    expect((await intelligence([ctx.abilityMap["Intelligence"], null, null, null])).total).toBe(12);
  });

  test("says whether the increases are picked at every level that takes one, as the save checks them", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx);
    const picked = async (levels: number, abilities: (string | null)[]) =>
      (await preview(ctx, characterId, fighter(levels), abilities)).attributes.picked;
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
    expect(raised.perLevelSkillPoints).toEqual([20, 5, 5, 5]);
    expect(raised.skills.skillPointsToSpend).toBe(35);
  });

  test("spends the skill points as the save spreads them, each skill with its ranks by points", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx);
    const { skills } = await preview(ctx, characterId, fighter(1), [null], { skills: { Climb: 6, Hide: 3 } });
    const skill = (name: string) => skills.skills.find((s) => s.id === ctx.skillMap[name])!;
    // Climb, a fighter's class skill, caps at 4 ranks at level 1: its 2 points over the cap aren't kept
    expect(skill("Climb")).toMatchObject({
      classSkill: true,
      points: 4,
      ranks: 4,
      rankStep: 1,
      ranksByPoints: [0, 1, 2, 3, 4],
      maxPoints: 4,
    });
    // Hide, cross-class, takes two points a rank, up to 2 ranks
    expect(skill("Hide")).toMatchObject({ classSkill: false, points: 3, ranks: 1.5, rankStep: 0.5 });
    expect(skill("Hide").ranksByPoints).toEqual([0, 0.5, 1, 1.5, 2]);
    // A skill no points went to reads what it would gain, within the points the others leave
    expect(skill("Swim")).toMatchObject({ points: 0, ranks: 0, maxPoints: 4 });
    expect(skill("Swim").ranksByPoints).toEqual([0, 1, 2, 3, 4]);
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
      const { skills: step } = await preview(ctx, characterId, plan, undefined, { skills });
      return (name: string) => step.skills.find((s) => s.id === ctx.skillMap[name])!;
    };
    // The other four spend the fighter level's points: Ride is left the rogue level's, cross-class there
    const last = await spend({ Climb: 4, Intimidate: 4, Jump: 4, Swim: 4, Ride: 4 });
    expect(last("Ride")).toMatchObject({
      points: 4,
      ranks: 2,
      ranksByPoints: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5],
    });
    // Ride first takes the fighter level's, a rank a point, and Swim, the last, the rogue level's
    const first = await spend({ Ride: 4, Climb: 4, Intimidate: 4, Jump: 4, Swim: 4 });
    expect([first("Ride").ranks, first("Swim").ranks]).toEqual([4, 4]);
    // Alone, Ride takes the fighter level's 4 ranks, then half a rank a point at the rogue level, up to its cap of 5
    const alone = await spend({});
    expect(alone("Ride")).toMatchObject({ maxPoints: 6, rankStep: 1, ranksByPoints: [0, 1, 2, 3, 4, 4.5, 5] });
    expect(alone("Hide")).toMatchObject({ classSkill: true, rankStep: 1 });
    expect(alone("Concentration")).toMatchObject({ classSkill: false, rankStep: 0.5 });
  });

  test("marks a multiclass plan's class skills as the character's classes make them, a single class's as its own", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx);
    await addCharacterLevel(characterId, (await findKlassLevel(ctx.klassMap.pc["Fighter"], 1))!.id);
    const ride = async (plan: [string, number][]) =>
      (await preview(ctx, characterId, plan)).skills.skills.find((s) => s.id === ctx.skillMap["Ride"])!;
    // Ride is the saved fighter level's class skill, neither planned class's: a rank costs two points at both
    expect(
      await ride([
        ["Rogue", 1],
        ["Wizard", 1],
      ]),
    ).toMatchObject({ classSkill: true, rankStep: 0.5 });
    expect(
      await ride([
        ["Rogue", 1],
        ["Rogue", 2],
      ]),
    ).toMatchObject({ classSkill: false, rankStep: 0.5 });
  });

  test("counts a human's bonus feat in the first level's General slots: its next feat goes there, then on the third", async () => {
    const ctx = await getSeedCtx();
    const nextGeneral = async (characterId: string, count: number, general: string[]) => {
      const result = await preview(ctx, characterId, fighter(count), undefined, { feats: { General: general } });
      return result.nextPickLevels.feats[ctx.aptMap.General];
    };
    // A human's bonus feat and its first level's: two at the first level, then one at the third
    const human = await createSeedCharacter(ctx);
    expect(await nextGeneral(human, 4, [])).toBe(0);
    expect(await nextGeneral(human, 4, ["Power Attack"])).toBe(0);
    expect(await nextGeneral(human, 4, ["Power Attack", "Great Fortitude"])).toBe(2);
    // An elf's first level's alone: once it's taken, a pick goes on the last level
    const elf = await createSeedCharacter(ctx, "fighter", { raceName: "Elf", languages: ["Common", "Elven"] });
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
    const result = await preview(ctx, sorcerer, levels);
    const spells = Object.values(result.powers.aptitudePools).find((pool) => pool.name === "Sorcerer Spells")!;
    expect(spells).toMatchObject({ leveled: true });
    expect(spells.levels?.["0"]?.available).toBeGreaterThan(0);
    expect(spells.levels?.["1"]?.available).toBeGreaterThan(0);
    expect(result.nextPickLevels.powers[spells.id]).toMatchObject({ "0": 0, "1": 0 });
    // The first level's four cantrips taken, the next goes on the second
    const cantrips = ["Detect Magic", "Light", "Read Magic", "Mage Hand"];
    const picked = await preview(ctx, sorcerer, levels, undefined, { powers: { "Sorcerer Spells": cantrips } });
    expect(picked.nextPickLevels.powers[spells.id]["0"]).toBe(1);
    expect(picked.powers.fitted[spells.id]).toEqual(cantrips.map((name) => ctx.powerMap[name]));
  });
  test("gives a spell level the character knows all of no slot from a later level's add", async () => {
    const ctx = await getSeedCtx();
    const cleric = ctx.klassMap.pc["Cleric"];
    const characterId = await createSeedCharacter(ctx);
    // A saved cleric level: she knows all her 1st-level spells
    await addCharacterLevel(characterId, (await findKlassLevel(cleric, 1))!.id);
    await Modifiers.create(db, {
      sourceId: (await findKlassLevel(cleric, 2))!.id,
      sourceType: "klass_levels",
      target: "aptitudes.clericspells.1.allowed",
      operator: "add",
      value: "1",
      valueType: "number",
    });
    invalidateSeededRuleset(ctx.rulesetId);
    const { nextPickLevels } = await preview(ctx, characterId, [
      ["Cleric", 2],
      ["Cleric", 3],
    ]);
    // The second level's add gives no 1st-level slot: a 1st-level pick goes on the last planned level
    expect(nextPickLevels.powers[ctx.aptMap["Cleric Spells"]]["1"]).toBe(1);
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
  const KNOWN_LIGHT = { message: 'Power "Light" is already known in Sorcerer Spells', refusal: "invalid" };
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
      const lightAgain = { ...SORCERER_2, powers: { "Sorcerer Spells": ["Light"] } };
      expect(levelUp(session, ctx, savedId, "Sorcerer", 2, lightAgain, force)).rejects.toMatchObject(KNOWN_LIGHT);

      const plannedId = await createSeedCharacter(ctx, "sorcerer", { xp: 1000 });
      const plan = { ...SORCERER_1_TO_2, powers: { "Sorcerer Spells": lightTwice } };
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
      target: "powers.magicmissile.wizard.known",
      value: "true",
      valueType: "boolean",
      operator: "set",
    });
    for (const force of [false, true]) {
      expect(levelUp(session, ctx, characterId, "Wizard", 1, WIZARD_1, force)).rejects.toMatchObject({
        message: 'Power "Magic Missile" is already known in Wizard Spells',
        refusal: "invalid",
      });
    }
    const previewed = await preview(ctx, characterId, [["Wizard", 1]], undefined, { powers: WIZARD_1.powers });
    expect(previewed.powers.fitted[ctx.aptMap["Wizard Spells"]]).not.toContain(ctx.powerMap["Magic Missile"]);
  });

  test("previews a spell picked again in its list as the save refuses it: dropped, and the rest saved", async () => {
    const ctx = await getSeedCtx();
    const sorcererSpells = ctx.aptMap["Sorcerer Spells"];
    const idsOf = (names: string[]) => names.map((name) => ctx.powerMap[name]);
    // A plan's second Light, past the first level's four cantrips
    const plannedId = await createSeedCharacter(ctx, "sorcerer", { xp: 1000 });
    const kept = ["Detect Magic", "Light", "Read Magic", "Mage Hand", "Resistance", "Magic Missile", "Shield"];
    const picked = { powers: { "Sorcerer Spells": [...kept.slice(0, 4), "Light", ...kept.slice(4)] } };
    const sorcerer1To2: [string, number][] = [
      ["Sorcerer", 1],
      ["Sorcerer", 2],
    ];
    const planned = await preview(ctx, plannedId, sorcerer1To2, undefined, picked);
    expect(planned.powers.fitted[sorcererSpells]).toEqual(idsOf(kept));
    const plan = { ...SORCERER_1_TO_2, powers: { "Sorcerer Spells": kept } };
    expect(await finalizeBatch(ctx, plannedId, levelsOf("Sorcerer", [4, 4]), plan)).toHaveLength(2);

    // A saved level's Light, picked again at the next
    const savedId = await createSeedCharacter(ctx, "sorcerer", { xp: 1000 });
    await levelUp(session, ctx, savedId, "Sorcerer", 1, SORCERER_1);
    const next = await preview(ctx, savedId, [["Sorcerer", 2]], undefined, {
      powers: { "Sorcerer Spells": ["Light", "Resistance"] },
    });
    expect(next.powers.fitted[sorcererSpells]).toEqual(idsOf(["Resistance"]));
    await levelUp(session, ctx, savedId, "Sorcerer", 2, {
      ...SORCERER_2,
      powers: { "Sorcerer Spells": ["Resistance"] },
    });
  });

  test("lets a spell known in one class's list be picked in another's, previewed and saved", async () => {
    const ctx = await getSeedCtx();
    const wizardSpells = ctx.aptMap["Wizard Spells"];
    const characterId = await createSeedCharacter(ctx, "sorcerer", { xp: 1000 });
    await levelUp(session, ctx, characterId, "Sorcerer", 1, SORCERER_1);
    const wizardLight = { powers: { "Wizard Spells": ["Light"] } };
    const previewed = await preview(ctx, characterId, [["Wizard", 1]], undefined, wizardLight);
    expect(previewed.powers.fitted[wizardSpells]).toEqual([ctx.powerMap["Light"]]);
    // Forced: the wizard level's other picks aren't this test's
    const [level] = await finalizeBatch(ctx, characterId, [["Wizard", 1, 4]], wizardLight, true);
    const saved = await CharacterLevelPowers.findMany(db, { characterLevelIds: [level.id] });
    expect(saved.map(({ aptitudeId, powerId }) => ({ aptitudeId, powerId }))).toEqual([
      { aptitudeId: wizardSpells, powerId: ctx.powerMap["Light"] },
    ]);
  });

  test("refuses a spell a modifier makes known in its list though another class's list picked it, forced or not", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx, "sorcerer", { xp: 1000 });
    await Modifiers.create(db, {
      sourceId: characterId,
      sourceType: "characters",
      target: "powers.light.sorcerer.known",
      value: "true",
      valueType: "boolean",
      operator: "set",
    });
    // The wizard's spellbook's Light, which the wizard's list doesn't know. Forced: the level's other picks aren't this
    // test's
    await finalizeBatch(ctx, characterId, [["Wizard", 1, 4]], { powers: { "Wizard Spells": ["Light"] } }, true);
    const sorcererLight = { powers: { "Sorcerer Spells": ["Light"] } };
    const lightLevel = { hp: 4, ...sorcererLight };
    for (const force of [false, true])
      expect(levelUp(session, ctx, characterId, "Sorcerer", 1, lightLevel, force)).rejects.toMatchObject(KNOWN_LIGHT);
    const previewed = await preview(ctx, characterId, [["Sorcerer", 1]], undefined, sorcererLight);
    expect(previewed.powers.fitted[ctx.aptMap["Sorcerer Spells"]]).toEqual([]);
  });

  test("lists a cleric spell a cleric/wizard's spellbook has on his cleric's list too, each at its class's DC", async () => {
    const ctx = await getSeedCtx();
    const abilities = { Intelligence: 16, Wisdom: 14 };
    const characterId = await createSeedCharacter(ctx, "fighter", { xp: 1000, abilities });
    // Forced: the levels' other picks aren't this test's
    const spellbook = { hp: 4, powers: { "Wizard Spells": ["Protection from Evil"] } };
    await levelUp(session, ctx, characterId, "Wizard", 1, spellbook, true);
    await levelUp(session, ctx, characterId, "Cleric", 1, WAR_CLERIC_1, true);

    const { spellGroups } = await CharactersService.getCharacter(session, characterId);
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
    const [light, detectMagic] = [ctx.powerMap["Light"], ctx.powerMap["Detect Magic"]];
    const characterId = await createSeedCharacter(ctx, "sorcerer", { xp: 1000 });
    const first = await levelUp(session, ctx, characterId, "Sorcerer", 1, SORCERER_1);
    // A second level that knows Light again, saved before the rule: written straight to the database
    const { skills } = picks(ctx, SORCERER_2);
    const second = await addCharacterLevel(characterId, (await findKlassLevel(ctx.klassMap.pc["Sorcerer"], 2))!.id, {
      powers: [{ powerId: light, aptitudeId: sorcererSpells }],
      skills: Object.entries(skills).map(([skillId, rank]) => ({ skillId, rank })),
    });

    for (const level of [first, second]) await resaveAsRead(characterId, level.id);
    // Its step keeps its own Light, and drops a spell the first level knows, as its save refuses it
    const step = await getLevelStep(session, characterId, "powers", {
      classId: ctx.klassMap.pc["Sorcerer"],
      level: 2,
      editedLevelId: second.id,
      powerPicks: [light, detectMagic].map((powerId) => ({ aptitudeId: sorcererSpells, powerId })),
    });
    expect(step.fitted[sorcererSpells]).toEqual([light]);
    expect(resaveAsRead(characterId, second.id, { [sorcererSpells]: [detectMagic] })).rejects.toMatchObject({
      message: 'Power "Detect Magic" is already known in Sorcerer Spells',
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
    expect(previewed.feats.fitted[ctx.aptMap["General"]]).toEqual([]);
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
    expect(previewed.feats.fitted[ctx.aptMap["Fighter Bonus Feat"]]).toEqual([]);
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
    expect(previewed.feats.fitted[ctx.aptMap["General"]]).toEqual([toughness, toughness]);
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
    const picked = [
      { aptitudeId: general, featId: ctx.featMap["Power Attack"] },
      { aptitudeId: general, featId: ctx.featMap["Iron Will"] },
      { aptitudeId: bonus, featId: ctx.featMap["Improved Initiative"] },
    ];
    const step = await getLevelStep(session, characterId, "feats", {
      classId: ctx.klassMap.pc["Fighter"],
      level: 1,
      editedLevelId: first.id,
      featPicks: picked,
    });
    expect(step.fitted).toEqual({
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
  const KNOWN_LIGHT = { message: 'Power "Light" is already known in Sorcerer Spells', refusal: "invalid" };
  const FOCUS = "Weapon Focus: Longsword";
  const WAR_WEAPON = "War Domain Weapon: Longsword";

  test("drops a feat another feat picked at the level gives, whatever their order, as the picker leaves it out and the save refuses it, forced or not", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx, "cleric");
    const [general, weapon] = [ctx.aptMap["General"], ctx.aptMap["War Domain Weapon"]];
    // Its General picker leaves Weapon Focus out once the war weapon is picked, which its own picker offers with
    // Weapon Focus picked
    expect(await offeredFeats(characterId, "Cleric", 1, "General", FOCUS)).toContain(FOCUS);
    const weaponPicked = { featPicks: [{ aptitudeId: weapon, featId: ctx.featMap[WAR_WEAPON] }] };
    expect(await offeredFeats(characterId, "Cleric", 1, "General", FOCUS, weaponPicked)).not.toContain(FOCUS);
    const focusPicked = { featPicks: [{ aptitudeId: general, featId: ctx.featMap[FOCUS] }] };
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
      expect(previewed.feats.fitted[general]).toEqual([ctx.featMap["Toughness"], ctx.featMap["Great Fortitude"]]);
      expect(previewed.feats.fitted[weapon]).toEqual([ctx.featMap[WAR_WEAPON]]);
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
    const pickOf = (name: string) => ({ aptitudeId: sorcererSpells, powerId: ctx.powerMap[name] });
    // Its picker leaves Light out once Detect Magic is picked, and offers Detect Magic with Light picked
    expect(await offeredPowers(characterId, "Sorcerer", 1, "Sorcerer Spells", "Light")).toContain("Light");
    const lightOffered = await offeredPowers(characterId, "Sorcerer", 1, "Sorcerer Spells", "Light", [
      pickOf("Detect Magic"),
    ]);
    expect(lightOffered).not.toContain("Light");
    const detectOffered = await offeredPowers(characterId, "Sorcerer", 1, "Sorcerer Spells", "Detect Magic", [
      pickOf("Light"),
    ]);
    expect(detectOffered).toEqual(["Detect Magic"]);

    // Picked first or last, Light gives way: its slot goes to the next cantrip, Detect Magic stays
    const kept = ["Detect Magic", "Read Magic", "Mage Hand", "Resistance", "Magic Missile", "Shield"];
    for (const spells of [
      ["Light", ...kept],
      [...kept, "Light"],
    ]) {
      const powers = { "Sorcerer Spells": spells };
      const previewed = await preview(ctx, characterId, [["Sorcerer", 1]], undefined, { powers });
      expect(previewed.powers.fitted[sorcererSpells]).toEqual(kept.map((name) => ctx.powerMap[name]));
      const plan = { ...SORCERER_1, powers: { "Sorcerer Spells": spells.filter((name) => name !== "Resistance") } };
      for (const force of [false, true])
        expect(levelUp(session, ctx, characterId, "Sorcerer", 1, plan, force)).rejects.toMatchObject(KNOWN_LIGHT);
    }
    const level = await levelUp(session, ctx, characterId, "Sorcerer", 1, {
      ...SORCERER_1,
      powers: { "Sorcerer Spells": kept },
    });
    const saved = await CharacterLevelPowers.findMany(db, { characterLevelIds: [level.id] });
    expect(saved.map(({ powerId }) => powerId).sort()).toEqual(kept.map((name) => ctx.powerMap[name]).sort());
  });

  test("drops a feat a spell picked at the level gives, as the feat picker leaves it out and the save refuses it", async () => {
    const { characterId, ctx } = await createLightGivingSorcerer();
    await give("powers", ctx.powerMap["Detect Magic"], "feats.ironwill.possessed");
    const detectMagic = { aptitudeId: ctx.aptMap["Sorcerer Spells"], powerId: ctx.powerMap["Detect Magic"] };
    expect(await offeredFeats(characterId, "Sorcerer", 1, "General", "Iron Will")).toEqual(["Iron Will"]);
    const detectPicked = { powerPicks: [detectMagic] };
    expect(await offeredFeats(characterId, "Sorcerer", 1, "General", "Iron Will", detectPicked)).toEqual([]);

    const plan = { ...SORCERER_1, feats: { ...SORCERER_1.feats, General: ["Toughness", "Iron Will"] } };
    const previewed = await preview(ctx, characterId, [["Sorcerer", 1]], undefined, plan);
    expect(previewed.feats.fitted[ctx.aptMap["General"]]).toEqual([ctx.featMap["Toughness"]]);
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
    expect(previewed.feats.fitted[ctx.aptMap["Fighter Bonus Feat"]]).toEqual([]);
    expect(previewed.feats.fitted[ctx.aptMap["War Domain Weapon"]]).toEqual([ctx.featMap[WAR_WEAPON]]);
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
    const picked = (feat: { id: string }) => ({ featPicks: [{ aptitudeId: general, featId: feat.id }] });
    expect(await offeredFeats(characterId, "Fighter", 1, "General", "Iron Will", picked(fortitude))).toEqual([]);
    expect(await offeredFeats(characterId, "Fighter", 1, "General", "Great Fortitude", picked(will))).toEqual([]);

    // Picked together, in either order: Great Fortitude stays, Iron Will gives way
    for (const both of [
      ["Great Fortitude", "Iron Will"],
      ["Iron Will", "Great Fortitude"],
    ]) {
      const plan = { ...FIGHTER_LEVELS[0], feats: { ...FIGHTER_LEVELS[0].feats, General: both } };
      const previewed = await preview(forkCtx, characterId, [["Fighter", 1]], undefined, { feats: plan.feats });
      expect(previewed.feats.fitted[general]).toEqual([fortitude.id]);
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
    const level = await addCharacterLevel(characterId, (await findKlassLevel(ctx.klassMap.pc["Cleric"], 1))!.id, {
      feats: Object.entries(feats).flatMap(([aptitudeId, ids]) => ids.map((featId) => ({ aptitudeId, featId }))),
      skills: Object.entries(skills).map(([skillId, rank]) => ({ skillId, rank })),
    });
    await resaveAsRead(characterId, level.id);

    // Its step keeps its own proficiency, and drops Weapon Focus, which the war weapon gives too, as its save refuses it
    const focused = picks(ctx, warClericFirst([proficiency, FOCUS]));
    const step = await getLevelStep(session, characterId, "feats", {
      classId: ctx.klassMap.pc["Cleric"],
      level: 1,
      editedLevelId: level.id,
      featPicks: Object.entries(focused.feats).flatMap(([aptitudeId, ids]) =>
        ids.map((featId) => ({ aptitudeId, featId })),
      ),
    });
    expect(step.fitted[general]).toEqual([ctx.featMap[proficiency]]);
    expect(step.fitted[weapon]).toEqual([ctx.featMap[WAR_WEAPON]]);
    for (const force of [false, true]) {
      const edit = CharacterLevelsService.updateLevel(
        session,
        characterId,
        level.id,
        8,
        [],
        skills,
        focused.feats,
        {},
        force,
      );
      expect(edit).rejects.toMatchObject(alreadyHeld(FOCUS));
    }
  });

  test("keeps a spell a level saved before the rule beside the pick that makes it known: it edits as it reads, a new gift refused", async () => {
    const { characterId, ctx, rulesetId } = await createLightGivingSorcerer();
    const sorcererSpells = ctx.aptMap["Sorcerer Spells"];
    const spellRows = (names: string[]) =>
      names.map((name) => ({ aptitudeId: sorcererSpells, powerId: ctx.powerMap[name] }));
    // A sorcerer level that picks Light, which its Detect Magic makes known: written straight to the database
    const { feats, powers, skills } = picks(ctx, SORCERER_1);
    const level = await addCharacterLevel(characterId, (await findKlassLevel(ctx.klassMap.pc["Sorcerer"], 1))!.id, {
      feats: Object.entries(feats).flatMap(([aptitudeId, ids]) => ids.map((featId) => ({ aptitudeId, featId }))),
      powers: powers[sorcererSpells].map((powerId) => ({ aptitudeId: sorcererSpells, powerId })),
      skills: Object.entries(skills).map(([skillId, rank]) => ({ skillId, rank })),
    });
    await resaveAsRead(characterId, level.id);
    const lightKept = await getLevelStep(session, characterId, "powers", {
      classId: ctx.klassMap.pc["Sorcerer"],
      level: 1,
      editedLevelId: level.id,
      powerPicks: spellRows(SORCERER_1.powers!["Sorcerer Spells"]),
    });
    expect(lightKept.fitted[sorcererSpells]).toEqual(powers[sorcererSpells]);

    // A level saved without Light: its edit that picks it is refused, and its step drops it
    const otherId = await createSeedCharacter(ctx, "sorcerer", { rulesetId, xp: 1000 });
    const kept = ["Detect Magic", "Read Magic", "Mage Hand", "Resistance", "Magic Missile", "Shield"];
    const saved = await levelUp(session, ctx, otherId, "Sorcerer", 1, {
      ...SORCERER_1,
      powers: { "Sorcerer Spells": kept },
    });
    const withLight = kept.map((name) => (name === "Resistance" ? "Light" : name));
    const step = await getLevelStep(session, otherId, "powers", {
      classId: ctx.klassMap.pc["Sorcerer"],
      level: 1,
      editedLevelId: saved.id,
      powerPicks: spellRows(withLight),
    });
    expect(step.fitted[sorcererSpells]).toEqual(
      withLight.filter((name) => name !== "Light").map((name) => ctx.powerMap[name]),
    );
    const lightPicks = picks(ctx, { ...SORCERER_1, powers: { "Sorcerer Spells": withLight } });
    for (const force of [false, true]) {
      const { feats: levelFeats, powers: levelPowers, skills: levelSkills } = lightPicks;
      const edit = CharacterLevelsService.updateLevel(
        session,
        otherId,
        saved.id,
        4,
        [],
        levelSkills,
        levelFeats,
        levelPowers,
        force,
      );
      expect(edit).rejects.toMatchObject(KNOWN_LIGHT);
    }
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
      ).levelDetails,
    ).toHaveLength(2);
  });

  test("leaves a character at it no level to take, as the class picker says", async () => {
    const ctx = await getSeedCtx();
    const levelsLeft = async (characterId: string) => {
      const { items } = await CharacterLevelsService.getAvailableClasses(
        session,
        characterId,
        {},
        {
          limit: 20,
          page: 1,
        },
      );
      return new Set(items.map((klass) => klass.levelsLeft));
    };
    const atLast = await createFighterAt(ctx, 20);
    expect(await levelsLeft(atLast)).toEqual(new Set([0]));
    expect(finalizeBatch(ctx, atLast, levelsOf("Rogue", [6]), {}, true)).rejects.toMatchObject(pastLastLevel(0));
    expect(await levelsLeft(await createFighterAt(ctx, 18))).toEqual(new Set([2]));
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
      raceName: "Human",
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
      powers: {
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
    const { skills, feats, powers } = picks(ctx, { ...plan, feats: { ...plan.feats, "Prohibited School": [] } });
    expect(
      CharacterLevelsService.updateLevel(session, characterId, level.id, 4, [], skills, feats, powers),
    ).rejects.toThrow(/Prohibited School.*unspent/);
  });

  describe("an ability increase", () => {
    test("is refused at a level that doesn't grant one, even forced", async () => {
      const { ctx, resave } = await setupFighter();
      for (const force of [false, true]) {
        expect(resave({ abilityId: ctx.abilityMap["Strength"] }, force)).rejects.toThrow(
          "Ability increase is not available at this level",
        );
      }
    });

    test("saved there before the check existed is refused again, and can be cleared", async () => {
      const { ctx, first, resave } = await setupFighter();
      await db
        .insert(levelAbilityIncreasesInCharacter)
        .values({ characterLevelId: first.id, abilityId: ctx.abilityMap["Strength"], amount: 1 });
      // The edit dialog sends the stored increase back.
      expect(resave({ abilityId: ctx.abilityMap["Strength"] })).rejects.toThrow(
        "Ability increase is not available at this level",
      );
      await resave({ abilityId: null });
      expect(await CharacterLevelAbilityIncreases.findMany(db, { characterLevelIds: [first.id] })).toEqual([]);
    });

    test("at a level that grants one raises one ability by 1, read back with the level", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "fighter", { xp: 6000 });
      const [strength, dexterity] = [ctx.abilityMap["Strength"], ctx.abilityMap["Dexterity"]];
      const save = (increases: AbilityIncrease[]) =>
        CharacterLevelsService.finalizeLevelUp(
          session,
          characterId,
          [1, 2, 3, 4].map((level) => ({
            abilityIncreases: level === 4 ? increases : [],
            hp: 6,
            klassId: ctx.klassMap.pc["Fighter"],
            level,
          })),
          {},
          {},
          {},
          true,
        );
      expect(save([{ abilityId: strength, amount: 2 }])).rejects.toThrow(
        "Level 4: Ability increases must add up to 1 at this level",
      );
      expect(
        save([
          { abilityId: strength, amount: 1 },
          { abilityId: dexterity, amount: 1 },
        ]),
      ).rejects.toThrow("Level 4: Ability increases must add up to 1 at this level");
      expect(
        save([
          { abilityId: strength, amount: 1 },
          { abilityId: strength, amount: 1 },
        ]),
      ).rejects.toThrow("Level 4: An ability is increased twice at this level");

      const saved = await save([{ abilityId: strength, amount: 1 }]);
      const level = await CharacterLevelsService.getLevel(session, characterId, saved[3].id);
      expect(level.abilityIncreases).toEqual([{ abilityId: strength, amount: 1 }]);
    });
  });
});
